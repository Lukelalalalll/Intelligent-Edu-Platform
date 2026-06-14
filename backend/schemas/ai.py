import re
from typing import List, Optional, Literal

from pydantic import BaseModel, Field, JsonValue, ConfigDict, field_validator

from backend.core.ai_provider import AIProvider


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


class ChatMessageSchema(BaseModel):
    role: Literal['user', 'assistant', 'system']
    content: str = ""


class SessionAttachmentMetaSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    file_name: str = Field(..., min_length=1, max_length=200)
    mime_type: str = Field(default="application/octet-stream", min_length=1, max_length=100)


class SessionMessageSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal['user', 'assistant', 'system']
    content: str = Field(default="", max_length=50000)
    reasoning: str = Field(default="", max_length=50000)
    is_course_relevant: Optional[bool] = None
    images: List[str] = Field(default_factory=list, max_length=8)
    files: List[SessionAttachmentMetaSchema] = Field(default_factory=list, max_length=20)
    citations: List[dict[str, JsonValue]] = Field(default_factory=list, max_length=32)
    ui_elements: List[dict[str, JsonValue]] = Field(default_factory=list, max_length=16)
    tool_progresses: List[dict[str, JsonValue]] = Field(default_factory=list, max_length=32)


class UpdateAiSessionSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = Field(default=None, max_length=200)
    messages: Optional[List[SessionMessageSchema]] = Field(default=None, max_length=500)


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

    @field_validator("retrieved_count", mode="after")
    @classmethod
    def _sync_count(cls, v, info):
        chunks = info.data.get("retrieved_chunks", [])
        if v != 0 and v != len(chunks):
            return len(chunks)
        return v


class GradingContextSchema(BaseModel):
    assignment: str = ""
    rubric: dict[str, JsonValue] = Field(default_factory=dict)
    selected_text: str = ""
    chat_history: List[ChatMessageSchema] = Field(default_factory=list)
    rag: RagContextSchema = Field(default_factory=RagContextSchema)


class AiChatSchema(BaseModel):
    messages: List[dict] = Field(..., max_length=100)
    provider: Optional[AIProvider] = 'local_ollama'
    tutor_mode: Literal['tutor', 'hint_only'] = 'tutor'
    session_id: Optional[str] = Field(default=None, max_length=64)
    web_search: bool = False
    search_engine: Literal['auto', 'google', 'bing', 'duckduckgo', 'wikipedia', 'arxiv', 'google_scholar'] = 'auto'
    enable_thinking: bool = False
    use_rag: bool = True
    rag_top_k: int = Field(default=6, ge=1, le=20)
    rag_profile: Literal['low-latency', 'balanced', 'high-recall'] = 'balanced'
    debug_retrieval: bool = False
    allow_web_correction: bool = False
    force_query_class: Literal[
        'keyword/factoid',
        'concept/explanation',
        'comparison',
        'multi-hop',
        'chapter/doc constrained',
        'out-of-domain',
        '',
    ] = ''


class StudyCozeSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    content: str = Field(..., min_length=1, max_length=5000)
    mode: Literal['chat', 'hint', 'explain', 'quiz', 'simplify', 'expand'] = 'chat'
    context: Optional[str] = Field(None, max_length=20000)
    messages: Optional[List[ChatMessageSchema]] = Field(None, max_length=20)


class AnalyzeSubmissionSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    provider: Optional[AIProvider] = 'local_ollama'
    submissionId: str


class FeedbackSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    provider: Optional[AIProvider] = 'local_ollama'
    submissionId: str
    selectedText: str
    assignment: str | None = None
    rubric: dict[str, JsonValue] | None = None
    messages: List[ChatMessageSchema] | None = None
    useRag: bool = True
    ragTopK: int = 4


class AnnotateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    provider: Optional[AIProvider] = 'local_ollama'
    submissionId: str
    selectedText: str
    assignment: str | None = None
    rubric: dict[str, JsonValue] | None = None
    messages: List[ChatMessageSchema] | None = None
    useRag: bool = True
    ragTopK: int = 4


class RegradeQuestionSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    provider: Optional[AIProvider] = 'local_ollama'
    submissionId: str
    questionId: str
    questionText: str | None = None
    studentAnswer: str
    referenceAnswer: str | None = None
    keyPoints: List[str] | None = None
    maxScore: float | None = None
    assignment: str | None = None
    rubric: dict[str, JsonValue] | None = None
