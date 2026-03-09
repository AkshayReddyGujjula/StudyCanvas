import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from rate_limiter import limiter
from models.schemas import CodeAssistRequest
from services import gemini_service
from services.gemini_service import MODEL_FLASH

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/code-assist")
@limiter.limit("15/minute; 100/hour")
async def code_assist(request: Request, payload: CodeAssistRequest):
    """
    Streams AI-generated or AI-edited code for the code editor node.
    Write mode: code is empty — AI writes from scratch.
    Edit mode:  code is present — AI returns full file with targeted change only.
    Response is raw code text (no markdown fences).
    """
    generator = gemini_service.stream_code_assist(
        language=payload.language,
        code=payload.code,
        prompt=payload.prompt,
    )
    return StreamingResponse(
        generator,
        media_type="text/plain",
        headers={"X-Model-Used": MODEL_FLASH},
    )
