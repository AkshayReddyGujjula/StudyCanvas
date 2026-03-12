from typing import Optional, Literal, List
from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    markdown_content: str
    raw_text: str
    filename: str
    page_count: int
    pdf_id: Optional[str] = None


class ConvertResponse(UploadResponse):
    """
    Returned by /api/convert-to-pdf.
    Extends UploadResponse with the converted PDF encoded as base64 so the
    browser's PDF viewer can display it without an extra round-trip.
    """
    pdf_data: str  # base64-encoded PDF bytes


class UserDetails(BaseModel):
    name: str
    age: str
    status: str
    educationLevel: str


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str


class UploadTextRequest(BaseModel):
    """
    Payload for /api/upload-text — used when the client has already extracted
    text from the PDF locally (e.g. to avoid Vercel's 4.5 MB payload limit).
    `pages` is a list of raw strings, one per PDF page (0-indexed).
    """
    pages: List[str] = Field(..., max_length=2000, description="Extracted text per page")
    filename: str = Field(..., max_length=255, description="Original file name")


class GenerateTitleRequest(BaseModel):
    raw_text: str = Field(..., max_length=500000, description="The raw document text")


class PageTitleRequest(BaseModel):
    page_text: str = Field(..., max_length=20000, description="Text content of the page")
    image_base64: Optional[str] = Field(None, description="Page screenshot as base64 JPEG for visual context")


class QueryRequest(BaseModel):
    question: str = Field(..., max_length=2000, description="The student's question")
    highlighted_text: str = Field(..., max_length=10000, description="The text selected by the student")
    raw_text: str = Field(..., max_length=500000, description="The raw document text")
    parent_response: Optional[str] = None
    user_details: Optional[UserDetails] = None
    chat_history: Optional[list[ChatMessage]] = None
    preferred_model: Optional[str] = Field(None, description="Override model selection: 'gemini-3.1-flash-lite' or 'gemini-2.5-flash-lite'")
    image_base64: Optional[str] = Field(None, description="Current page rendered as base64 JPEG for vision context")


class CodeAssistRequest(BaseModel):
    language: str = Field(..., max_length=20, description="Programming language: python, java, or c")
    code: str = Field("", max_length=100000, description="Current code in the editor (empty for new code)")
    prompt: str = Field(..., max_length=2000, description="User's instruction to the AI")


class QuizNode(BaseModel):
    highlighted_text: str = Field(..., max_length=10000)
    question: str = Field(..., max_length=2000)
    answer: str = Field(..., max_length=10000)
    page_index: Optional[int] = None


class QuizRequest(BaseModel):
    source_type: Literal["struggling", "page"] = "struggling"
    struggling_nodes: list[QuizNode] = Field(default_factory=list, max_length=50) # Limit number of nodes
    raw_text: str = Field(..., max_length=500000)
    pdf_id: Optional[str] = None
    page_index: Optional[int] = None
    page_content: Optional[str] = None
    image_base64: Optional[str] = None  # Client-side rendered page image
    canvas_context: Optional[str] = Field(None, max_length=100000)  # Sticky notes, summaries, transcriptions, custom prompts


class QuizQuestion(BaseModel):
    question: str
    question_type: Literal["short_answer", "mcq"]
    options: Optional[List[str]] = None    # exactly 4 items when question_type == "mcq"
    correct_option: Optional[int] = None   # 0-based index of correct option for MCQ


class ValidateAnswerRequest(BaseModel):
    question: str = Field(..., max_length=2000)
    student_answer: str = Field(..., max_length=5000)
    raw_text: str = Field(..., max_length=500000)
    question_type: Optional[Literal["short_answer", "mcq"]] = "short_answer"
    correct_option: Optional[int] = None   # supplied for MCQ so backend can short-circuit


class ValidateAnswerResponse(BaseModel):
    status: Literal["correct", "incorrect", "partial"]
    explanation: str
    input_tokens: int = 0
    output_tokens: int = 0


class FlashcardsRequest(BaseModel):
    source_type: Literal["struggling", "page"] = "struggling"
    struggling_nodes: list[QuizNode] = Field(default_factory=list, max_length=50)
    raw_text: str = Field(..., max_length=500000)
    pdf_id: Optional[str] = None
    page_index: Optional[int] = None
    page_content: Optional[str] = None
    existing_flashcards: list[str] = Field(default_factory=list)
    image_base64: Optional[str] = None  # Client-side rendered page image
    canvas_context: Optional[str] = Field(None, max_length=100000)  # Sticky notes, summaries, transcriptions, custom prompts


class Flashcard(BaseModel):
    question: str
    answer: str


class QuizFollowUpRequest(BaseModel):
    """Request body for a follow-up question after a revision quiz answer."""
    quiz_question: str = Field(..., max_length=2000, description="The original quiz question")
    student_answer: str = Field(..., max_length=5000, description="The student's submitted answer")
    ai_feedback: str = Field(..., max_length=5000, description="The AI's feedback/explanation provided after grading")
    follow_up_message: str = Field(..., max_length=2000, description="The student's follow-up question")
    chat_history: Optional[list[ChatMessage]] = Field(default=None, description="Prior follow-up chat turns")
    raw_text: Optional[str] = Field(None, max_length=50000, description="Relevant page content for additional context")


class GenerateQuizTitleRequest(BaseModel):
    """Request body for generating a 2-7 word title for a completed quiz session."""
    source_type: str = "struggling"              # "page" | "struggling"
    page_index: Optional[int] = None             # 1-based, only for 'page' quizzes
    questions: List[str] = Field(..., description="Question strings from the completed quiz")


class GenerateQuizTitleResponse(BaseModel):
    """Response for quiz title generation."""
    title: str
    model_used: str
    input_tokens: int = 0
    output_tokens: int = 0

