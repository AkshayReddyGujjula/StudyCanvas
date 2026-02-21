from typing import Optional, Literal
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


class ValidateAnswerRequest(BaseModel):
    question: str
    student_answer: str
    raw_text: str


class ValidateAnswerResponse(BaseModel):
    is_correct: bool
    explanation: str
