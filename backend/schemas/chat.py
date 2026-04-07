from typing import List, Optional

from pydantic import BaseModel


class ChatSendMessageSchema(BaseModel):
    roomId: Optional[str] = None
    content: str
    messageType: str = "text"
    fileUrl: Optional[str] = None
    fileName: Optional[str] = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    replyTo: Optional[str] = None  # message ID being replied to


class ChatTranslateSchema(BaseModel):
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
