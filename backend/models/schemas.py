from typing import Optional, Literal
from pydantic import BaseModel


class UploadResponse(BaseModel):
    markdown_content: str
    raw_text: str
    filename: str
    page_count: int


class QueryRequest(BaseModel):
    question: str
    highlighted_text: str
    raw_text: str
    parent_response: Optional[str] = None


class QuizNode(BaseModel):
    highlighted_text: str
    question: str
    answer: str


class QuizRequest(BaseModel):
    struggling_nodes: list[QuizNode]
    raw_text: str


class QuizQuestion(BaseModel):
    question: str
    options: dict[str, str]
    answer: Literal["A", "B", "C", "D"]
    explanation: str
