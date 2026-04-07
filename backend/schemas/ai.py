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


class AiChatSchema(BaseModel):
    messages: List[dict] = Field(..., max_length=100)


class StudyCozeSchema(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    mode: Literal['chat', 'hint', 'explain'] = 'chat'
    context: Optional[str] = Field(None, max_length=20000)
    messages: Optional[List[ChatMessageSchema]] = Field(None, max_length=20)


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
