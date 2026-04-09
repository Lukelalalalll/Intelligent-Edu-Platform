from typing import Literal, Dict, List, Optional

from pydantic import BaseModel, Field


class ChatSendMessageSchema(BaseModel):
    roomId: Optional[str] = None
    content: Optional[str] = ""
    messageType: str = "text"
    fileUrl: Optional[str] = None
    fileName: Optional[str] = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    replyTo: Optional[str] = None  # message ID being replied to


class ChatTranslateSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    text: str
    targetLang: str = "en"


class ChatBatchDeleteSchema(BaseModel):
    messageIds: List[str]


class ChatForwardSchema(BaseModel):
    messageIds: List[str]

class ChatCreateRoomSchema(BaseModel):
    name: str
    memberIds: List[str]

class ChatFriendRequestSchema(BaseModel):
    targetUsername: str

class ChatCreateDirectRoomSchema(BaseModel):
    targetUserId: str

class ChatCreateCourseGroupSchema(BaseModel):
    courseId: str


# ── AI Assistant Schemas ──

class ChatAiSummarySchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    window_size: int = Field(default=30, ge=5, le=100)
    mode: str = Field(default="summary", pattern=r"^(summary|unread|action_items)$")
    unread_since: Optional[str] = None


class ChatAiReplySuggestionsSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    tone: str = Field(default="concise", pattern=r"^(concise|polite|professional|action)$")
    latest_count: int = Field(default=10, ge=3, le=50)


class ChatAiRewriteSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    draft_text: str = Field(..., min_length=1, max_length=2000)
    style: str = Field(default="concise", pattern=r"^(concise|polite|professional|assertive|friendly)$")


class ChatAiAssistantSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    query: str = Field(..., min_length=1, max_length=1000)
    context_window: int = Field(default=20, ge=5, le=50)


# ── Transfer Station Schemas ──

class ChatTransferStartSchema(BaseModel):
    room_id: str
    message_id: str
    target_module: str = Field(..., pattern=r"^(sub1|sub2|sub3|sub4|sub5)$")
    target_options: Dict = Field(default_factory=dict)
