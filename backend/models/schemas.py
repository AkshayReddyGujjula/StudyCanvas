from typing import Optional, Literal, List
from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    markdown_content: str
    raw_text: str
    filename: str
    page_count: int
    pdf_id: Optional[str] = None


class UserDetails(BaseModel):
    name: str
    age: str
    status: str
    educationLevel: str


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str


class GenerateTitleRequest(BaseModel):
    raw_text: str = Field(..., max_length=500000, description="The raw document text")


class QueryRequest(BaseModel):
    question: str = Field(..., max_length=2000, description="The student's question")
    highlighted_text: str = Field(..., max_length=10000, description="The text selected by the student")
    raw_text: str = Field(..., max_length=500000, description="The raw document text")
    parent_response: Optional[str] = None
    user_details: Optional[UserDetails] = None
    chat_history: Optional[list[ChatMessage]] = None


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


class FlashcardsRequest(BaseModel):
    source_type: Literal["struggling", "page"] = "struggling"
    struggling_nodes: list[QuizNode] = Field(default_factory=list, max_length=50)
    raw_text: str = Field(..., max_length=500000)
    pdf_id: Optional[str] = None
    page_index: Optional[int] = None
    page_content: Optional[str] = None
    existing_flashcards: list[str] = Field(default_factory=list)


class Flashcard(BaseModel):
    question: str
    answer: str

