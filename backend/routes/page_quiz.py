from fastapi import APIRouter, Request
from pydantic import BaseModel
from rate_limiter import limiter
from services import gemini_service

router = APIRouter()


class PageQuizRequest(BaseModel):
    from pydantic import Field
    page_content: str = Field(..., max_length=200000)
    pdf_id: str | None = None
    page_index: int | None = None


class PageQuizResponse(BaseModel):
    questions: list[str]


class GradeAnswerRequest(BaseModel):
    from pydantic import Field
    question: str = Field(..., max_length=2000)
    student_answer: str = Field(..., max_length=5000)
    page_content: str = Field(..., max_length=200000)
    user_details: dict | None = None
    pdf_id: str | None = None
    page_index: int | None = None


class GradeAnswerResponse(BaseModel):
    feedback: str


@router.post("/page-quiz", response_model=PageQuizResponse)
@limiter.limit("15/minute; 100/hour; 500/day")
async def generate_page_quiz(request: Request, payload: PageQuizRequest):
    """Generate 3-5 short-answer questions based solely on a single page's content."""
    questions = await gemini_service.generate_page_quiz(
        payload.page_content, pdf_id=payload.pdf_id, page_index=payload.page_index
    )
    return PageQuizResponse(questions=questions)


@router.post("/grade-answer", response_model=GradeAnswerResponse)
@limiter.limit("30/minute; 200/hour; 1000/day")
async def grade_answer(request: Request, payload: GradeAnswerRequest):
    """Grade a student's answer to a page-quiz question and return direct feedback."""
    feedback = await gemini_service.grade_answer(
        question=payload.question,
        student_answer=payload.student_answer,
        page_content=payload.page_content,
        user_details=payload.user_details,
        pdf_id=payload.pdf_id,
        page_index=payload.page_index,
    )
    return GradeAnswerResponse(feedback=feedback)
