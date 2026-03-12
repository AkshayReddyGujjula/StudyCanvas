from fastapi import APIRouter, HTTPException, Request
from models.schemas import PageTitleRequest
from rate_limiter import limiter
from services.gemini_service import generate_page_title
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/page-title")
@limiter.limit("60/minute; 500/hour")
async def get_page_title(request: Request, payload: PageTitleRequest):
    """
    Generate a concise 3-7 word title for a single PDF page.
    Accepts the page text and an optional base64 JPEG screenshot for visual context.
    """
    try:
        title, input_tokens, output_tokens = await generate_page_title(payload.page_text, payload.image_base64)
        return {"title": title, "model_used": "gemini-2.5-flash-lite", "input_tokens": input_tokens, "output_tokens": output_tokens}
    except Exception as e:
        logger.error("Page title generation failed: %s", e)
        raise HTTPException(status_code=500, detail="Page title generation failed.")
