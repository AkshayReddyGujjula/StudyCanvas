import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from rate_limiter import limiter
from models.schemas import QueryRequest, GenerateTitleRequest
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/query")
@limiter.limit("15/minute; 100/hour; 500/day")
async def query_stream(request: Request, payload: QueryRequest):
    """
    Streams Gemini response as plain text using an asynchronous generator.
    Avoids blocking the event loop.
    """
    generator = gemini_service.stream_query(
        question=payload.question,
        highlighted_text=payload.highlighted_text,
        raw_text=payload.raw_text,
        parent_response=payload.parent_response,
        user_details=payload.user_details,
        chat_history=payload.chat_history,
    )
    return StreamingResponse(generator, media_type="text/plain")


@router.post("/generate-title")
@limiter.limit("10/minute; 100/hour")
async def generate_title(request: Request, payload: GenerateTitleRequest):
    title = await gemini_service.generate_title(payload.raw_text)
    return {"title": title}
