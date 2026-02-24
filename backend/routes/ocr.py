import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()

class OCRRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded JPEG/PNG image")

class OCRResponse(BaseModel):
    text: str

@router.post("/vision", response_model=OCRResponse)
async def extract_text_from_image(request: OCRRequest):
    """
    Receives a base64 encoded image (snippet from the PDF), sends it to 
    Gemini Vision, and returns the extracted text.
    """
    try:
        if not request.image_base64:
            raise HTTPException(status_code=400, detail="Base64 image data is required")
            
        extracted_text = await gemini_service.image_to_text(request.image_base64)
        return OCRResponse(text=extracted_text)
    except Exception as e:
        logger.error(f"Error in OCR vision endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract text from image: {str(e)}")
