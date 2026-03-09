"""
POST /api/convert-to-pdf

Accepts a .docx or .pptx upload, converts it to a text-selectable PDF using
python-docx / python-pptx + ReportLab (no system binaries needed), then
extracts text / Markdown via the existing pdf_service pipeline.

The response includes:
  - All standard UploadResponse fields (markdown_content, raw_text, filename,
    page_count, pdf_id) — so all downstream AI routes work unchanged.
  - pdf_data: base64-encoded PDF bytes so the browser PDF viewer can display
    the converted document without a second network request.
"""

import asyncio
import base64
import logging
import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile

from models.schemas import ConvertResponse
from rate_limiter import limiter
from services import conversion_service, file_service, pdf_service

logger = logging.getLogger(__name__)
router = APIRouter()

# MIME types we accept, mapped to their normalised format identifier
_MIME_TO_FMT: dict[str, str] = {
    # Standard OOXML types
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    # Legacy / generic types some browsers/OSes may send
    "application/msword": "docx",
    "application/vnd.ms-powerpoint": "pptx",
    # Some browsers send this for unknown binary files
    "application/octet-stream": None,
}


@router.post("/convert-to-pdf", response_model=ConvertResponse)
@limiter.limit("5/minute; 30/hour; 100/day")
async def convert_to_pdf(request: Request, file: UploadFile):
    """
    Convert a .docx or .pptx file to a searchable PDF.

    Steps
    -----
    1. Validate file type (MIME + extension).
    2. Save upload to a temp file.
    3. Convert to PDF bytes (CPU-bound, runs in a thread pool).
    4. Save converted PDF to a temp file.
    5. Extract text + Markdown via pdf_service (reuses existing pipeline).
    6. Return ConvertResponse with all UploadResponse fields + base64 pdf_data.

    Temp files are always deleted in the finally block.
    """
    if file.size and file.size > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 100 MB.")

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = (file.content_type or "").lower().split(";")[0].strip()

    # Resolve file format: prefer the file extension (more reliable) but fall
    # back to the MIME type when the extension is absent or ambiguous.
    if ext in ("docx", "pptx"):
        fmt = ext
    else:
        fmt = _MIME_TO_FMT.get(content_type)

    if not fmt:
        raise HTTPException(
            status_code=400,
            detail="Only .docx (Word) and .pptx (PowerPoint) files are accepted.",
        )

    tmp_path: str | None = None
    pdf_tmp_path: str | None = None

    try:
        tmp_path = await file_service.save_temp_file(file)

        # Run CPU-bound conversion in a thread pool so the event loop stays free
        if fmt == "docx":
            pdf_bytes, _ = await asyncio.to_thread(
                conversion_service.convert_docx_to_pdf, tmp_path
            )
        else:
            pdf_bytes, _ = await asyncio.to_thread(
                conversion_service.convert_pptx_to_pdf, tmp_path
            )

        # Persist the converted PDF so pdf_service can open it with a file path
        pdf_tmp_path = await asyncio.to_thread(
            file_service.save_bytes_as_temp, pdf_bytes, ".pdf"
        )

        # Extract text + Markdown (reuses pypdf / pymupdf4llm pipeline)
        try:
            raw_text, markdown_content, page_count, extra_path = await asyncio.to_thread(
                pdf_service.extract_text_and_markdown, pdf_tmp_path
            )
            if extra_path:
                file_service.delete_file(extra_path)
        except ValueError as exc:
            if "empty_text" in str(exc):
                # The document had no extractable text (e.g. fully image-based).
                # Return minimal metadata so the viewer still works.
                raw_text = ""
                markdown_content = "## Page 1\n\n(No extractable text found)"
                page_count = 1
            else:
                raise

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Conversion failed for %s: %s", filename, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Could not convert the file: {exc}",
        )
    finally:
        if tmp_path:
            file_service.delete_file(tmp_path)
        if pdf_tmp_path:
            file_service.delete_file(pdf_tmp_path)

    # Display filename with .pdf extension
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    display_filename = f"{stem}.pdf"

    return ConvertResponse(
        markdown_content=markdown_content,
        raw_text=raw_text,
        filename=display_filename,
        page_count=page_count,
        pdf_id=str(uuid.uuid4()),
        pdf_data=base64.b64encode(pdf_bytes).decode("ascii"),
    )
