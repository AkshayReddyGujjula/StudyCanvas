from typing import Optional, Literal, List
from pydantic import BaseModel


class UploadResponse(BaseModel):
    markdown_content: str
    raw_text: str
    filename: str
    page_count: int


class UserDetails(BaseModel):
    name: str
    age: str
    status: str
    educationLevel: str


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str


class GenerateTitleRequest(BaseModel):
    raw_text: str


class QueryRequest(BaseModel):
    question: str
    highlighted_text: str
    raw_text: str
    parent_response: Optional[str] = None
    user_details: Optional[UserDetails] = None
    chat_history: Optional[list[ChatMessage]] = None


class QuizNode(BaseModel):
    highlighted_text: str
    question: str
    answer: str


class QuizRequest(BaseModel):
    struggling_nodes: list[QuizNode]
    raw_text: str


class QuizQuestion(BaseModel):
    question: str
    question_type: Literal["short_answer", "mcq"]
    options: Optional[List[str]] = None    # exactly 4 items when question_type == "mcq"
    correct_option: Optional[int] = None   # 0-based index of correct option for MCQ


class ValidateAnswerRequest(BaseModel):
    question: str
    student_answer: str
    raw_text: str
    question_type: Optional[Literal["short_answer", "mcq"]] = "short_answer"
    correct_option: Optional[int] = None   # supplied for MCQ so backend can short-circuit


class ValidateAnswerResponse(BaseModel):
    status: Literal["correct", "incorrect", "partial"]
    explanation: str

