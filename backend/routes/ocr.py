import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from rate_limiter import limiter
from services import gemini_service
from services.gemini_service import MODEL_LITE

logger = logging.getLogger(__name__)
router = APIRouter()

class OCRRequest(BaseModel):
    image_base64: str = Field(..., max_length=5000000, description="Base64 encoded JPEG/PNG image")

class OCRResponse(BaseModel):
    text: str
    model_used: str = ""

@router.post("/vision", response_model=OCRResponse)
@limiter.limit("10/minute; 100/hour; 500/day")
async def extract_text_from_image(request: Request, payload: OCRRequest):
    """
    Receives a base64 encoded image (snippet from the PDF), sends it to 
    Gemini Vision, and returns the extracted text.
    """
    try:
        if not payload.image_base64:
            raise HTTPException(status_code=400, detail="Base64 image data is required")
            
        extracted_text = await gemini_service.image_to_text(payload.image_base64)
        return OCRResponse(text=extracted_text, model_used=MODEL_LITE)
    except Exception as e:
        logger.error(f"Error in OCR vision endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to extract text from image due to an internal error.")
