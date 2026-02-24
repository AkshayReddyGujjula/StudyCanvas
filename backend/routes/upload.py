import asyncio
import logging
from fastapi import APIRouter, UploadFile, HTTPException
from fastapi.responses import FileResponse
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

    # Save PDF to persistent storage initially
    pdf_id = await file_service.save_pdf_file(file)
    
    # Reset file position for reading
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
            
            # If the PDF was enhanced with OCR text layers, overwrite the saved file
            if new_pdf_path:
                import shutil
                persistent_path = file_service.get_pdf_path(pdf_id)
                if persistent_path:
                    shutil.copy2(new_pdf_path, persistent_path)
                # Cleanup the temp OCR file
                file_service.delete_file(new_pdf_path)
                
        except ValueError as e:
            if str(e) == "empty_text":
                raise HTTPException(
                    status_code=400,
                    detail="This PDF appears to be scanned or image-based and our OCR engine could not read it. Please upload a clearer text-based PDF.",
                )
            raise
    finally:
        file_service.delete_file(tmp_path)

    return UploadResponse(
        markdown_content=markdown_content,
        raw_text=raw_text,
        filename=file.filename or "upload.pdf",
        page_count=page_count,
        pdf_id=pdf_id,
    )


@router.get("/pdf/{pdf_id}")
async def get_pdf(pdf_id: str):
    """
    Retrieves a stored PDF file by its ID.
    """
    pdf_path = file_service.get_pdf_path(pdf_id)
    if not pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"{pdf_id}.pdf"
    )
