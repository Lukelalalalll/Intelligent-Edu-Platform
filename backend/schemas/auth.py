import re
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class SelfUpdateProfileSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    username: Optional[str] = None
    email: Optional[str] = None
    current_password: str
    password: Optional[str] = None


class UpdateProfileSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Literal['student', 'teacher', 'admin']] = None
    teacherCourseIds: Optional[List[str]] = None


class PasswordResetRequestSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    email: Optional[str] = None
    username: Optional[str] = None

    @field_validator("email", "username")
    @classmethod
    def strip_optional_identifier(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class PasswordResetConfirmSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    token: str = Field(min_length=32, max_length=256)
    new_password: str


class GoogleLoginSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    credential: str = Field(min_length=1, max_length=8192)

    @field_validator("credential")
    @classmethod
    def strip_credential(cls, value: str) -> str:
        return value.strip()


class GoogleLinkSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    ticket_id: str = Field(min_length=8, max_length=128)
    password: str = Field(min_length=1, max_length=4096)

    @field_validator("ticket_id", "password")
    @classmethod
    def strip_link_fields(cls, value: str) -> str:
        return value.strip()


class GoogleCompleteSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    ticket_id: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=1, max_length=128)
    staff_code: Optional[str] = Field(default=None, max_length=32)

    @field_validator("ticket_id", "username")
    @classmethod
    def strip_required_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("staff_code")
    @classmethod
    def strip_staff_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class SessionRevokeSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    session_id: str = Field(min_length=8, max_length=128)


class MfaEnrollmentStartSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    current_password: str = Field(min_length=1, max_length=4096)


class MfaConfirmSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    code: str = Field(min_length=6, max_length=32)


class MfaDisableSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    current_password: str = Field(min_length=1, max_length=4096)
    code: str = Field(min_length=6, max_length=32)


class BackupCodeRegenSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    current_password: str = Field(min_length=1, max_length=4096)


class StepUpVerifySchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    code: str = Field(min_length=6, max_length=32)


class MfaChallengeVerifySchema(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_to_snake, populate_by_name=True)

    challenge_id: str = Field(min_length=8, max_length=128)
    code: str = Field(min_length=6, max_length=32)

class TeacherPreferencesSchema(BaseModel):
    feedback_style: Literal["concise", "detailed", "constructive"] = "concise"
    feedback_language: str = "English"
    auto_rag: bool = True
    default_rag_top_k: int = 4
    email_auto_classify: bool = True
    email_suggest_reply: bool = True


class DeepSeekConfigSchema(BaseModel):
    base_url: str = Field(default="https://api.deepseek.com", max_length=240)
    api_key: Optional[str] = Field(default=None, max_length=4096)
    clear_api_key: bool = False
    model: str = Field(default="deepseek-v4-pro", min_length=1, max_length=80)
    stream: bool = False
    reasoning_effort: Literal["low", "medium", "high"] = "high"
    thinking_type: Literal["enabled", "disabled"] = "enabled"

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return cleaned

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return value.strip()


class OpenAIConfigSchema(BaseModel):
    base_url: str = Field(default="https://api.openai.com/v1", max_length=240)
    api_key: Optional[str] = Field(default=None, max_length=4096)
    clear_api_key: bool = False
    model: str = Field(default="gpt-5.5", min_length=1, max_length=80)
    stream: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return cleaned

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return value.strip()


class MultimodalOpenAIConfigSchema(BaseModel):
    base_url: str = Field(default="https://api.openai.com/v1", max_length=240)
    api_key: Optional[str] = Field(default=None, max_length=4096)
    clear_api_key: bool = False
    model: str = Field(default="gpt-4o", min_length=1, max_length=80)
    stream: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return cleaned

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return value.strip()


class BigModelConfigSchema(BaseModel):
    base_url: str = Field(default="https://open.bigmodel.cn/api/paas/v4", max_length=240)
    api_key: Optional[str] = Field(default=None, max_length=4096)
    clear_api_key: bool = False
    text_model: str = Field(default="glm-4.5-flash", min_length=1, max_length=120)
    image_model: str = Field(default="glm-5v-flash", min_length=1, max_length=120)
    stream: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip().rstrip("/")
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return cleaned

    @field_validator("text_model", "image_model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return value.strip()
