from typing import Literal, List, Optional

from pydantic import BaseModel


class ExtractQuestionsSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    task_id: str
    page_numbers: List[int] = []
    prompt: str = "exercise"

class GenerateQuestionsSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    task_id: str
    subject: str
    question_type: str
    num_questions: int
    difficulty: int | str
    constraints: List[str] = []
    output_language: str = "Chinese"
    question_basis: Optional[str] = None
    knowledge_points: str = ""
    saved_screenshots: List[str] = []

class ExportQuestionsSchema(BaseModel):
    pass

class UploadScreenshotSchema(BaseModel):
    image: str
    chapter_number: str = "unknown"
    sub_chapter_number: str = "unknown"
    exercise_number: str = "unknown"
