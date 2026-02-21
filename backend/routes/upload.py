import logging
from fastapi import APIRouter, UploadFile, HTTPException
from services import pdf_service, gemini_service, file_service
from models.schemas import UploadResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile):
    """
    Accepts a PDF upload, extracts text with PyMuPDF, converts to Markdown with Gemini.
    The temp file is always deleted in the finally block.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    tmp_path = file_service.save_temp_file(file)

    try:
        try:
            raw_text, page_count = pdf_service.extract_text(tmp_path)
        except ValueError as e:
            if str(e) == "empty_text":
                raise HTTPException(
                    status_code=400,
                    detail="This PDF appears to be scanned or image-based. Please upload a text-based PDF.",
                )
            raise

        try:
            markdown_content = gemini_service.convert_to_markdown(raw_text)
        except Exception as exc:
            logger.warning("Gemini conversion failed, falling back to raw text: %s", exc)
            markdown_content = raw_text

    finally:
        file_service.delete_file(tmp_path)

    return UploadResponse(
        markdown_content=markdown_content,
        raw_text=raw_text,
        filename=file.filename or "upload.pdf",
        page_count=page_count,
    )
