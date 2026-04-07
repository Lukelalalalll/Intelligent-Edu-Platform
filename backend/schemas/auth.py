from typing import List, Optional, Literal

from pydantic import BaseModel


class AuthSchema(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: Optional[Literal['student', 'teacher', 'admin']] = 'student'
    teacherCourseIds: Optional[List[str]] = None
    staff_code: Optional[str] = None

class UpdateProfileSchema(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Literal['student', 'teacher', 'admin']] = None
    teacherCourseIds: Optional[List[str]] = None

class ResetPasswordSchema(BaseModel):
    username: str
    email: str
    new_password: str

class TeacherPreferencesSchema(BaseModel):
    feedback_style: Literal["concise", "detailed", "constructive"] = "concise"
    feedback_language: str = "English"
    auto_rag: bool = True
    default_rag_top_k: int = 4
    email_auto_classify: bool = True
    email_suggest_reply: bool = True
