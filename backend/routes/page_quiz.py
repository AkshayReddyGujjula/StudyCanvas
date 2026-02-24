from fastapi import APIRouter
from pydantic import BaseModel
from services import gemini_service

router = APIRouter()


class PageQuizRequest(BaseModel):
    page_content: str
    pdf_id: str | None = None
    page_index: int | None = None


class PageQuizResponse(BaseModel):
    questions: list[str]


class GradeAnswerRequest(BaseModel):
    question: str
    student_answer: str
    page_content: str
    user_details: dict | None = None
    pdf_id: str | None = None
    page_index: int | None = None


class GradeAnswerResponse(BaseModel):
    feedback: str


@router.post("/page-quiz", response_model=PageQuizResponse)
async def generate_page_quiz(request: PageQuizRequest):
    """Generate 3-5 short-answer questions based solely on a single page's content."""
    questions = await gemini_service.generate_page_quiz(
        request.page_content, pdf_id=request.pdf_id, page_index=request.page_index
    )
    return PageQuizResponse(questions=questions)


@router.post("/grade-answer", response_model=GradeAnswerResponse)
async def grade_answer(request: GradeAnswerRequest):
    """Grade a student's answer to a page-quiz question and return direct feedback."""
    feedback = await gemini_service.grade_answer(
        question=request.question,
        student_answer=request.student_answer,
        page_content=request.page_content,
        user_details=request.user_details,
        pdf_id=request.pdf_id,
        page_index=request.page_index,
    )
    return GradeAnswerResponse(feedback=feedback)
