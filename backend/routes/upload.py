import asyncio
import logging
from fastapi import APIRouter, UploadFile, HTTPException
from services import pdf_service, file_service
from models.schemas import UploadResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile):
    """
    Accepts a PDF upload. Text and Markdown are extracted locally with
    pymupdf4llm — no Gemini call needed, giving sub-second turnaround for
    typical documents. The temp file is always deleted in the finally block.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Async read — does not block the event loop even for large uploads.
    tmp_path = await file_service.save_temp_file(file)

    try:
        # Run CPU-bound extraction in a thread pool so the event loop stays
        # free to handle other requests while processing.
        try:
            raw_text, markdown_content, page_count = await asyncio.to_thread(
                pdf_service.extract_text_and_markdown, tmp_path
            )
        except ValueError as e:
            if str(e) == "empty_text":
                raise HTTPException(
                    status_code=400,
                    detail="This PDF appears to be scanned or image-based. Please upload a text-based PDF.",
                )
            raise
    finally:
        file_service.delete_file(tmp_path)

    return UploadResponse(
        markdown_content=markdown_content,
        raw_text=raw_text,
        filename=file.filename or "upload.pdf",
        page_count=page_count,
    )
