import re
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict


def _camel_to_snake(name: str) -> str:
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


class AuthSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    username: str
    password: str
    email: Optional[str] = None
    role: Optional[Literal['student', 'teacher', 'admin']] = 'student'
    teacherCourseIds: Optional[List[str]] = None
    staff_code: Optional[str] = None

class UpdateProfileSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

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
