import asyncio
import logging
import uuid
from fastapi import APIRouter, UploadFile, HTTPException, Request
from rate_limiter import limiter
from services import pdf_service, file_service
from models.schemas import UploadResponse, UploadTextRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
@limiter.limit("5/minute; 50/hour; 200/day")
async def upload_pdf(request: Request, file: UploadFile):
    """
    Accepts a PDF upload. Text and Markdown are extracted locally with
    pypdf — no Gemini call needed, giving sub-second turnaround for
    typical documents. The temp file is always deleted in the finally block.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    if file.size and file.size > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 100MB.")

    # Validate file signature (magic number)
    header = await file.read(5)
    if header != b"%PDF-":
        raise HTTPException(status_code=400, detail="Invalid PDF file format.")
    await file.seek(0)

    # Async read — does not block the event loop even for large uploads.
    tmp_path = await file_service.save_temp_file(file)

    try:
        # Run CPU-bound extraction in a thread pool so the event loop stays
        # free to handle other requests while processing.
        try:
            raw_text, markdown_content, page_count, new_pdf_path = await asyncio.to_thread(
                pdf_service.extract_text_and_markdown, tmp_path
            )
            
            if new_pdf_path:
                file_service.delete_file(new_pdf_path)
                
        except ValueError as e:
            raise
    finally:
        file_service.delete_file(tmp_path)

    pdf_id = str(uuid.uuid4())

    return UploadResponse(
        markdown_content=markdown_content,
        raw_text=raw_text,
        filename=file.filename or "upload.pdf",
        page_count=page_count,
        pdf_id=pdf_id,
    )


@router.post("/upload-text", response_model=UploadResponse)
@limiter.limit("5/minute; 50/hour; 200/day")
async def upload_pdf_text(request: Request, body: UploadTextRequest):
    """
    Alternative upload path for large PDFs.

    When the raw PDF would exceed Vercel's 4.5 MB serverless payload limit the
    frontend extracts page text client-side with pdf.js and POSTs the plain text
    here as JSON instead.  The server applies the same ligature/encoding cleanup
    and builds the identical markdown structure that /api/upload would return,
    so all downstream routes (quiz, flashcards, query …) work unchanged.
    """
    if not body.pages:
        raise HTTPException(status_code=400, detail="No page text provided.")

    raw_pages: list[str] = []
    md_pages: list[str] = []

    for i, page_text in enumerate(body.pages):
        cleaned = pdf_service._clean(page_text)
        raw_pages.append(cleaned)
        formatted = pdf_service._format_plain_text(cleaned)
        md_pages.append(f"## Page {i + 1}\n\n{formatted}")

    raw_text = "\n\n".join(raw_pages)
    markdown_content = "\n\n".join(md_pages)

    if not raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail="empty_text: No extractable text found. This PDF may be image-only or scanned. Please use a text-based PDF."
        )

    pdf_id = str(uuid.uuid4())

    return UploadResponse(
        markdown_content=markdown_content,
        raw_text=raw_text,
        filename=body.filename,
        page_count=len(body.pages),
        pdf_id=pdf_id,
    )
