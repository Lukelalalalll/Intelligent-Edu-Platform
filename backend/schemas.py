from typing import List, Optional, Literal

from pydantic import BaseModel, Field, JsonValue


class ChatMessageSchema(BaseModel):
    role: Literal['user', 'assistant', 'system']
    content: str = ""


class RagChunkSchema(BaseModel):
    chunk_id: int | None = None
    score: float | None = None
    text: str = ""


class RagContextSchema(BaseModel):
    retrieved_count: int = 0
    retrieved_chunks: List[RagChunkSchema] = Field(default_factory=list)


class GradingContextSchema(BaseModel):
    assignment: str = ""
    rubric: dict[str, JsonValue] = Field(default_factory=dict)
    selected_text: str = ""
    chat_history: List[ChatMessageSchema] = Field(default_factory=list)
    rag: RagContextSchema = Field(default_factory=RagContextSchema)

class AuthSchema(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: Optional[Literal['student', 'teacher', 'admin']] = 'student'
    teacherCourseIds: Optional[List[str]] = None

class UpdateProfileSchema(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Literal['student', 'teacher', 'admin']] = None
    teacherCourseIds: Optional[List[str]] = None

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
    api_type: Optional[str] = None
    prompt: Optional[str] = None

class GenerateQuestionsSchema(BaseModel):
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


# === Sub1 PPT Generation ===
class PptProcessSchema(BaseModel):
    ppt_schema: dict


# === Teacher Grading ===
class AnnotationPayload(BaseModel):
    submissionId: str
    annotation: dict


class SubmissionScoreSchema(BaseModel):
    submissionId: str
    totalScore: int
    rubricScores: dict
    overallFeedback: str = ""
    gradedBy: str | None = None


class FinalizeAnnotationsSchema(BaseModel):
    submissionId: str
    annotations: List[dict]


class AnalyzeSubmissionSchema(BaseModel):
    submissionId: str


class FeedbackSchema(BaseModel):
    submissionId: str
    selectedText: str
    assignment: str | None = None
    rubric: dict[str, JsonValue] | None = None
    messages: List[ChatMessageSchema] | None = None
    useRag: bool = True
    ragTopK: int = 4


class AnnotateSchema(BaseModel):
    submissionId: str
    selectedText: str
    assignment: str | None = None
    rubric: dict[str, JsonValue] | None = None
    messages: List[ChatMessageSchema] | None = None
    useRag: bool = True
    ragTopK: int = 4


class AdminCourseSchema(BaseModel):
    courseId: str
    name: str
    teacherId: str = ""
    degreeLevel: Literal['bachelor', 'master', 'phd'] = 'bachelor'
    semester: str = ""
    studentIds: List[str] = Field(default_factory=list)


class AdminCourseStudentSchema(BaseModel):
    studentId: str


class AdminAssignmentSchema(BaseModel):
    id: str
    title: str
    description: str = ""
    dueDate: str = ""
    rubric: dict = Field(default_factory=dict)


class AdminDbDocumentSchema(BaseModel):
    document: dict = Field(default_factory=dict)