from pydantic import BaseModel
from typing import List, Optional

class AuthSchema(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: Optional[str] = 'student'

class UpdateProfileSchema(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None

class CombineSchema(BaseModel):
    filename: str
    selected_indices: List[int]
    use_llm: bool = False

class SaveHighlightsSchema(BaseModel):
    filename: str
    highlights: List[dict]

class AiChatSchema(BaseModel):
    messages: List[dict]

class SearchSvgSchema(BaseModel):
    prompt: str

class DownloadSvgSchema(BaseModel):
    svg: str


class SummarizeRequestSchema(BaseModel):
    highlights: List[dict]  # 前端保存的高亮结构
    num_of_bullets: int = 3
    words_each_bullet: int = 15

class GenerateScriptSchema(BaseModel):
    slides_results: List[dict]
    script_style: str = "academic"
    presentation_title: str = ""
    generate_word: bool = True


# === Sub2 (Question Generator) Schemas ===
class ExtractQuestionsSchema(BaseModel):
    page_numbers: List[int] = []

class GenerateQuestionsSchema(BaseModel):
    subject: str
    question_type: str
    num_questions: int
    difficulty: str

class ExportQuestionsSchema(BaseModel):
    format: str = "word"

class UploadScreenshotSchema(BaseModel):
    image: str
    chapter_number: str = "unknown"
    sub_chapter_number: str = "unknown"
    exercise_number: str = "unknown"


class SummarizeChaptersSchema(BaseModel):
    chapterData: List[dict]
    total_pages: int
    num_of_bullets: int
    words_each_bullet: int