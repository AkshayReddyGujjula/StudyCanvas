import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from models.schemas import QueryRequest
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/query")
def query_stream(request: QueryRequest):
    """
    Streams Gemini response as plain text using a synchronous def generator.
    FastAPI wraps synchronous generators in iterate_in_threadpool() automatically.
    This is critical: the google-generativeai SDK's generate_content(stream=True)
    is blocking/synchronous — using async def would freeze the event loop.
    """
    generator = gemini_service.stream_query(
        question=request.question,
        highlighted_text=request.highlighted_text,
        raw_text=request.raw_text,
        parent_response=request.parent_response,
    )
    return StreamingResponse(generator, media_type="text/plain")
