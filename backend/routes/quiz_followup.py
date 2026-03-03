import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from rate_limiter import limiter
from models.schemas import QuizFollowUpRequest
from services import gemini_service
from services.gemini_service import MODEL_LITE

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/quiz-followup")
@limiter.limit("20/minute; 200/hour")
async def quiz_followup(request: Request, payload: QuizFollowUpRequest):
    """
    Streams a follow-up conversational response after the student has received
    feedback on a revision quiz question. Allows the student to ask clarification
    questions to deepen their understanding.

    Uses Flash Lite (fast, cheap) — these are short clarification messages.
    """
    generator = gemini_service.quiz_followup_chat(
        quiz_question=payload.quiz_question,
        student_answer=payload.student_answer,
        ai_feedback=payload.ai_feedback,
        follow_up_message=payload.follow_up_message,
        chat_history=payload.chat_history,
        raw_text=payload.raw_text,
    )
    return StreamingResponse(
        generator,
        media_type="text/plain",
        headers={"X-Model-Used": MODEL_LITE},
    )
