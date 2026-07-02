from __future__ import annotations

from typing import ClassVar

from pydantic import field_validator

from .security import SecuritySettingsSegment


class ProviderSettingsSegment(SecuritySettingsSegment):
    SERP_API_KEY: str | None = None
    DEEPSEEK_API_KEY: str | None = None
    COZE_TOKEN: str | None = None
    COZE_BOT_ID: str | None = None
    COZE_API_BASE: str = "https://api.coze.com/v3/chat"
    COZE_API_ROOT: ClassVar[str] = "https://api.coze.com"
    COZE_REQUEST_TIMEOUT_SECONDS: float = 90.0
    COZE_POLL_INTERVAL_SECONDS: float = 1.2
    COZE_POLL_MAX_ATTEMPTS: int = 50
    COZE_OCR_ENABLED: bool = False

    AI_DEFAULT_PROVIDER: str = "local_ollama"
    AI_ALLOW_PROVIDER_SWITCH: bool = True
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2-vision:11b"
    OLLAMA_REQUEST_TIMEOUT_SECONDS: float = 180.0
    OLLAMA_LIGHT_TEMPERATURE: float = 0.2
    OLLAMA_LIGHT_NUM_PREDICT: int = 256
    OLLAMA_LIGHT_NUM_CTX: int = 4096
    OLLAMA_HEAVY_TEMPERATURE: float = 0.4
    OLLAMA_HEAVY_NUM_PREDICT: int = 1024
    OLLAMA_HEAVY_NUM_CTX: int = 8192

    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-v4-pro"
    DEEPSEEK_REQUEST_TIMEOUT_SECONDS: float = 120.0
    DEEPSEEK_TEMPERATURE: float = 0.4
    DEEPSEEK_MAX_TOKENS: int = 4096

    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-5.5"
    OPENAI_REQUEST_TIMEOUT_SECONDS: float = 120.0
    OPENAI_TEMPERATURE: float = 0.4
    OPENAI_MAX_TOKENS: int = 4096

    VIDEO_BROLL_PROVIDER: str = "comfyui"
    COMFYUI_BASE_URL: str = "http://127.0.0.1:8188"
    COMFYUI_WORKFLOW_PATH: str = f"{SecuritySettingsSegment.BASE_DIR}/workflows/text_to_video_wan.json"
    COMFYUI_DEFAULT_NEGATIVE_PROMPT: str = (
        "blurry, low quality, watermark, text, subtitles, deformed hands, "
        "extra fingers, distorted face, flicker, jitter, duplicate person, bad anatomy"
    )
    COMFYUI_TIMEOUT_SECONDS: int = 1800
    COMFYUI_POLL_INTERVAL_SECONDS: float = 5.0
    VIDEO_DEFAULT_WIDTH: int = 832
    VIDEO_DEFAULT_HEIGHT: int = 480
    VIDEO_DEFAULT_FPS: int = 16

    @field_validator("COZE_REQUEST_TIMEOUT_SECONDS", mode="before")
    @classmethod
    def clamp_coze_timeout(cls, value) -> float:
        return max(5.0, min(300.0, float(value or 90.0)))

    @field_validator("COZE_POLL_INTERVAL_SECONDS", mode="before")
    @classmethod
    def clamp_coze_poll_interval(cls, value) -> float:
        return max(0.5, min(30.0, float(value or 1.2)))

    @field_validator("AI_DEFAULT_PROVIDER", mode="before")
    @classmethod
    def normalize_provider(cls, value: str) -> str:
        return str(value or "local_ollama").strip().lower()

    @field_validator("VIDEO_BROLL_PROVIDER", mode="before")
    @classmethod
    def normalize_broll_provider(cls, value: str) -> str:
        return str(value or "comfyui").strip().lower()

    @field_validator("OLLAMA_BASE_URL", mode="before")
    @classmethod
    def strip_ollama_url(cls, value: str) -> str:
        return (str(value or "http://localhost:11434") or "").strip().rstrip("/")

    @field_validator("COMFYUI_BASE_URL", mode="before")
    @classmethod
    def strip_comfy_url(cls, value: str) -> str:
        return (str(value or "http://127.0.0.1:8188") or "").strip().rstrip("/")
