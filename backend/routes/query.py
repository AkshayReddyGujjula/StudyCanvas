import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from models.schemas import QueryRequest, GenerateTitleRequest
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/query")
async def query_stream(request: QueryRequest):
    """
    Streams Gemini response as plain text using an asynchronous generator.
    Avoids blocking the event loop.
    """
    generator = gemini_service.stream_query(
        question=request.question,
        highlighted_text=request.highlighted_text,
        raw_text=request.raw_text,
        parent_response=request.parent_response,
        user_details=request.user_details,
        chat_history=request.chat_history,
    )
    return StreamingResponse(generator, media_type="text/plain")


@router.post("/generate-title")
async def generate_title(request: GenerateTitleRequest):
    title = await gemini_service.generate_title(request.raw_text)
    return {"title": title}
