import logging
from fastapi import APIRouter, HTTPException
from models.schemas import QuizRequest, QuizQuestion, ValidateAnswerRequest, ValidateAnswerResponse
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/quiz")
async def generate_quiz(request: QuizRequest):
    """
    Generates short-answer quiz questions using Gemini with JSON schema enforcement.
    Validates response; retries once if invalid.
    """
    struggling_nodes = [n.model_dump() for n in request.struggling_nodes]

    try:
        result = await gemini_service.generate_quiz(struggling_nodes, request.raw_text, pdf_id=request.pdf_id)
        _validate_quiz(result)
        return result
    except Exception as e:
        logger.warning("Quiz generation attempt 1 failed: %s — retrying...", e)

    try:
        result = await gemini_service.generate_quiz(struggling_nodes, request.raw_text, pdf_id=request.pdf_id)
        _validate_quiz(result)
        return result
    except Exception as e:
        logger.error("Quiz generation attempt 2 failed: %s", e)
        raise HTTPException(status_code=500, detail="Quiz generation failed after retry.")


def _validate_quiz(result: list) -> None:
    """Validates that the result is a list of valid QuizQuestion-shaped dicts."""
    if not isinstance(result, list) or len(result) == 0:
        raise ValueError("Quiz result is not a non-empty list")
    for item in result:
        q = QuizQuestion(**item)  # will raise if schema mismatch
        if q.question_type == "mcq":
            if not q.options or len(q.options) != 4:
                raise ValueError(f"MCQ question must have exactly 4 options: {q.question}")
            if q.correct_option is None or not (0 <= q.correct_option <= 3):
                raise ValueError(f"MCQ question must have correct_option 0-3: {q.question}")


@router.post("/validate")
async def validate_answer(request: ValidateAnswerRequest):
    """
    Validates the user's answer (short-answer via Gemini, MCQ via index comparison).
    """
    try:
        result = await gemini_service.validate_answer(
            request.question,
            request.student_answer,
            request.raw_text,
            question_type=request.question_type or "short_answer",
            correct_option=request.correct_option,
        )
        return result
    except Exception as e:
        logger.error("Answer validation failed: %s", e)
        raise HTTPException(status_code=500, detail="Answer validation failed.")
