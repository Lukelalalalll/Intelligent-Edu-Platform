from typing import List, Optional, Literal

from pydantic import BaseModel, Field, JsonValue


class ChatMessageSchema(BaseModel):
    role: Literal['user', 'assistant', 'system']
    content: str = ""


class RagChunkSchema(BaseModel):
    chunk_id: int | None = None
    score: float | None = None
    text: str = ""
    page_num: int = -1
    char_start: int = 0
    char_end: int = 0


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
    messages: List[dict] = Field(..., max_length=100)

class SearchSvgSchema(BaseModel):
    prompt: str

class DownloadSvgSchema(BaseModel):
    svg: str


class SummarizeRequestSchema(BaseModel):
    highlights: List[dict]  # 前端保存的高亮结构
    num_of_bullets: int = 3
    words_each_bullet: int = 15


class ClassifyHighlightsSchema(BaseModel):
    highlights: List[dict]  # [{"text": str, "id": str, "sectionTitle": str}, ...]


class BatchHighlightActionSchema(BaseModel):
    action: Literal['keep', 'remove']
    category: Optional[str] = None          # filter by category
    min_confidence: Optional[float] = None  # filter by confidence threshold
    highlight_ids: Optional[List[str]] = None  # explicit list of IDs

class GenerateScriptSchema(BaseModel):
    slides_results: List[dict]
    script_style: str = "academic"
    presentation_title: str = ""
    generate_word: bool = True


class MapToSlidesSchema(BaseModel):
    summaries: List[dict]
    available_layouts: Optional[List[str]] = None
    start_number: int = 1


class ValidateSlidesSchema(BaseModel):
    slides: List[dict]


class EvaluateQualitySchema(BaseModel):
    highlights: List[dict] = []
    slides: List[dict]


# === Sub2 (Question Generator) Schemas ===
class ExtractQuestionsSchema(BaseModel):
    task_id: str
    page_numbers: List[int] = []
    prompt: str = "exercise"

class GenerateQuestionsSchema(BaseModel):
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
    pass  # Export is always markdown; no format field needed

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


# === Teacher Preferences ===
class TeacherPreferencesSchema(BaseModel):
    feedback_style: Literal["concise", "detailed", "constructive"] = "concise"
    feedback_language: str = "English"
    auto_rag: bool = True
    default_rag_top_k: int = 4
    email_auto_classify: bool = True
    email_suggest_reply: bool = True