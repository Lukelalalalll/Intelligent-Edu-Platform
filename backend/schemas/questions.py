from typing import Literal, List, Optional

from pydantic import BaseModel

from backend.core.ai_provider import AIProvider


class ExtractQuestionsSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    task_id: str
    page_numbers: List[int] = []
    prompt: str = "exercise"

class GenerateQuestionsSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    task_id: Optional[str] = None
    source_text: str = ""
    question_type: str
    num_questions: int
    difficulty: int | str
    constraints: List[str] = []
    output_language: str = "English"
    source_type: Literal['pdf', 'screenshot_set'] = 'pdf'
    page_numbers: List[int] = []
    saved_screenshots: List[str] = []

    # Backward compatibility fields from legacy clients
    subject: str = ""
    question_basis: Optional[str] = None
    knowledge_points: str = ""


class QuestionDraftSchema(BaseModel):
    id: str
    stem: str
    options: List[str] = []
    answer: str = ""
    explanation: str = ""
    raw_markdown: str = ""


class SuggestConstraintsSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    task_id: str
    source_type: Literal['pdf', 'screenshot_set'] = 'pdf'
    page_numbers: List[int] = []
    question_type: str = "Multiple choice"
    num_questions: int = 5
    difficulty: int | str = 3
    output_language: str = "English"

class UploadScreenshotSchema(BaseModel):
    image: str
    chapter_number: str = "unknown"
    sub_chapter_number: str = "unknown"
    exercise_number: str = "unknown"


class QuestionHistoryFinalizeSchema(BaseModel):
    questions: List[QuestionDraftSchema]
    markdown: str = ""
    selected_question_ids: List[str] = []


class QuestionExportSelectionSchema(BaseModel):
    questions: List[QuestionDraftSchema]
    format: Literal['markdown', 'pdf'] = 'markdown'
    filename: str = "questions"


class QuestionOpsRunCreateSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    task_id: Optional[str] = None
    course_id: Optional[str] = None
    source_text: Optional[str] = None
    dedupe_threshold: float = 0.82


class QuestionOpsDedupeApplySchema(BaseModel):
    dedupe_threshold: Optional[float] = None
