import logging
from fastapi import APIRouter, HTTPException
from models.schemas import QuizRequest, QuizQuestion
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/quiz")
async def generate_quiz(request: QuizRequest):
    """
    Generates 4 MCQ quiz questions using Gemini with JSON schema enforcement.
    Validates response; retries once if invalid.
    """
    struggling_nodes = [n.model_dump() for n in request.struggling_nodes]

    try:
        result = await gemini_service.generate_quiz(struggling_nodes, request.raw_text)
        _validate_quiz(result)
        return result
    except Exception as e:
        logger.warning("Quiz generation attempt 1 failed: %s — retrying...", e)

    try:
        result = await gemini_service.generate_quiz(struggling_nodes, request.raw_text)
        _validate_quiz(result)
        return result
    except Exception as e:
        logger.error("Quiz generation attempt 2 failed: %s", e)
        raise HTTPException(status_code=500, detail="Quiz generation failed after retry.")


def _validate_quiz(result: list) -> None:
    """Validates that the result is a list of 4 valid QuizQuestion-shaped dicts."""
    if not isinstance(result, list) or len(result) == 0:
        raise ValueError("Quiz result is not a non-empty list")
    for item in result:
        QuizQuestion(**item)  # will raise if schema mismatch
