"""Application configuration — pydantic-settings based.

All settings are read from environment variables (with .env file support).
Usage (unchanged across the codebase):
    from backend.config import Config
    value = Config.SECRET_KEY
"""
from __future__ import annotations

import json
import math
import os
from collections import Counter
from datetime import timedelta
from typing import Annotated, ClassVar

from dotenv import load_dotenv
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Load .env files before pydantic-settings picks them up natively.
_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv()
load_dotenv(os.path.join(_BASE_DIR, ".env"))

SENSITIVE_ENVS: tuple[str, ...] = ('production', 'prod', 'staging', 'preprod')


def _is_sensitive(env: str) -> bool:
    return env.lower() in SENSITIVE_ENVS


class Settings(BaseSettings):
    """Central application settings backed by environment variables."""

    model_config = SettingsConfigDict(
        env_file=os.path.join(_BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Base ──────────────────────────────────────────────────────────
    BASE_DIR: ClassVar[str] = _BASE_DIR

    ENV: str = Field(default="development", alias="ENV")
    LOG_LEVEL: str = "INFO"
    ENABLE_RAG_PRELOAD: bool = False
    INTERNAL_GATEWAY_TOKEN: str = ""
    INTERNAL_GATEWAY_HEADER: str = "X-Internal-Gateway"
    GOOGLE_AUTH_CLIENT_ID: str = ""

    # ── Security ──────────────────────────────────────────────────────
    SECRET_KEY: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_TOKEN_LOCATION: ClassVar[list[str]] = ["cookies"]
    JWT_COOKIE_CSRF_PROTECT: bool = False   # overridden by model_validator
    JWT_ACCESS_COOKIE_NAME: ClassVar[str] = "access_token_cookie"
    JWT_REFRESH_COOKIE_NAME: ClassVar[str] = "refresh_token_cookie"
    JWT_CSRF_COOKIE_NAME: ClassVar[str] = "csrf_token"
    JWT_CSRF_HEADER_NAME: ClassVar[str] = "X-CSRF-Token"
    JWT_MFA_CHALLENGE_COOKIE_NAME: ClassVar[str] = "mfa_challenge_cookie"
    JWT_COOKIE_SAMESITE: str = "lax"
    JWT_COOKIE_SECURE: bool = False          # overridden by model_validator
    JWT_EXPIRES_MINUTES: int = 15
    JWT_REFRESH_EXPIRES_DAYS: int = 30
    AUTH_LOGIN_PRINCIPAL_WINDOW_MINUTES: int = 15
    AUTH_LOGIN_PRINCIPAL_MAX_FAILURES: int = 5
    AUTH_LOGIN_PRINCIPAL_LOCKOUT_MINUTES: int = 15
    AUTH_LOGIN_IP_WINDOW_MINUTES: int = 15
    AUTH_LOGIN_IP_MAX_FAILURES: int = 25
    AUTH_LOGIN_IP_LOCKOUT_MINUTES: int = 15
    AUTH_PASSWORD_RESET_IDENTIFIER_WINDOW_MINUTES: int = 60
    AUTH_PASSWORD_RESET_IDENTIFIER_MAX_REQUESTS: int = 3
    AUTH_PASSWORD_RESET_IP_WINDOW_MINUTES: int = 60
    AUTH_PASSWORD_RESET_IP_MAX_REQUESTS: int = 10
    SECURITY_AUDIT_RETENTION_DAYS: int = 180

    @property
    def JWT_ACCESS_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(minutes=self.JWT_EXPIRES_MINUTES)

    @property
    def JWT_REFRESH_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(days=self.JWT_REFRESH_EXPIRES_DAYS)

    # ── External API keys ─────────────────────────────────────────────
    SERP_API_KEY: str | None = None
    DEEPSEEK_API_KEY: str | None = None
    MONGO_URI: str = "mongodb://localhost:27017/intelligent_edu"
    COZE_TOKEN: str | None = None
    COZE_BOT_ID: str | None = None
    COZE_API_BASE: str = "https://api.coze.com/v3/chat"
    COZE_API_ROOT: ClassVar[str] = "https://api.coze.com"
    COZE_REQUEST_TIMEOUT_SECONDS: float = 90.0
    COZE_POLL_INTERVAL_SECONDS: float = 1.2
    COZE_POLL_MAX_ATTEMPTS: int = 50
    COZE_OCR_ENABLED: bool = False

    # ── AI provider ───────────────────────────────────────────────────
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

    # ── DeepSeek ──────────────────────────────────────────────────────
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-v4-pro"
    DEEPSEEK_REQUEST_TIMEOUT_SECONDS: float = 120.0
    DEEPSEEK_TEMPERATURE: float = 0.4
    DEEPSEEK_MAX_TOKENS: int = 4096

    # ── RAG ───────────────────────────────────────────────────────────
    RAG_VECTORSTORE_DIR: str = ""
    RAG_EMBEDDING_MODEL: str = "BAAI/bge-m3"
    RAG_TWO_STAGE_CHAT_ENABLED: bool = True
    RAG_EMPTY_RETRY_ENABLED: bool = True
    RAG_POSTCHECK_ENABLED: bool = True
    RAG_RETRIEVE_TOP_N: int = 15
    RAG_ANSWER_TOP_K: int = 6
    RAG_EVIDENCE_MAX_CHARS: int = 4000
    RAG_EVIDENCE_MAX_CHARS_PER_CHUNK: int = 800
    RAG_CHUNK_SIZE: int = 1200
    RAG_CHUNK_OVERLAP: int = 200
    RAG_NEURAL_RERANK_ENABLED: bool = True
    RAG_NEURAL_RERANK_CANDIDATES: int = 20
    RAG_NEURAL_RERANK_MODEL: str = "BAAI/bge-reranker-v2-m3"
    RAG_QUERY_PLANNER_ENABLED: bool = True
    RAG_DEFAULT_PROFILE: str = "balanced"
    RAG_ENABLE_WEB_CORRECTION: bool = True
    RAG_WEB_CORRECTION_MIN_SCORE: float = 0.45
    RAG_STAGE1_CANDIDATE_LIMIT: int = 60
    RAG_STAGE2_CANDIDATE_LIMIT: int = 20
    RAG_HYBRID_DENSE_POOL: int = 80
    RAG_HYBRID_SPARSE_POOL: int = 80
    RAG_EXPANSION_POOL: int = 40
    RAG_USE_LATE_INTERACTION: bool = False
    RAG_LATE_INTERACTION_TOP_K: int = 20
    RAG_COLBERT_ENDPOINT: str = ""
    RAG_OPENSEARCH_ENABLED: bool = False
    RAG_OPENSEARCH_ENDPOINT: str = "http://127.0.0.1:9200"
    RAG_OPENSEARCH_INDEX_PREFIX: str = "course-rag"
    RAG_OPENSEARCH_USERNAME: str = ""
    RAG_OPENSEARCH_PASSWORD: str = ""
    RAG_OPENSEARCH_TIMEOUT_SECONDS: float = 5.0
    RAG_OPENSEARCH_VERIFY_CERTS: bool = False
    RAG_OPENSEARCH_CA_CERTS: str = ""
    RAG_ENABLE_HIERARCHICAL_RECALL: bool = True
    RAG_ENABLE_GRAPH_EXPANSION: bool = True
    RAG_EVIDENCE_MAX_SPANS: int = 8
    # ── RAG Internationalization ───────────────────────────────────
    RAG_QUERY_LANGUAGE: str = "auto"

    # ── RAG Advanced Optimizations ────────────────────────────────
    # Contextual Retrieval (Anthropic, Sep 2024): prepend LLM-generated
    # per-chunk context before embedding.  Disabled by default because
    # enabling it requires re-indexing all existing documents.
    RAG_CONTEXTUAL_RETRIEVAL_ENABLED: bool = False
    # Override Ollama model used for context generation (default: OLLAMA_MODEL)
    RAG_CONTEXTUAL_RETRIEVAL_MODEL: str = ""
    # Multi-Query: generate N query variants and RRF-merge their results
    RAG_MULTI_QUERY_ENABLED: bool = True
    RAG_MULTI_QUERY_VARIANTS: int = 2
    # HyDE: generate a hypothetical answer and use it as an extra retrieval query
    RAG_HYDE_ENABLED: bool = False
    # Parent-window expansion: after retrieval, expand each child chunk to
    # include its neighbouring chunks for richer LLM context
    RAG_PARENT_EXPANSION_ENABLED: bool = True
    RAG_PARENT_EXPANSION_WINDOW: int = 1
    # Self-Query: heuristic chapter/doc filter extraction from the query string
    RAG_SELF_QUERY_ENABLED: bool = True
    # Lost-in-the-Middle: reorder retrieved chunks to U-shape for LLM context
    RAG_LOST_IN_MIDDLE_REORDER: bool = True
    # ── RAG Dynamic Budget ─────────────────────────────────────────
    RAG_CHARS_PER_TOKEN: float = 2.5
    RAG_GENERATION_RESERVE_TOKENS: int = 1500
    RAG_SYSTEM_OVERHEAD_TOKENS: int = 600
    RAG_PROVIDER_CONTEXT_WINDOWS: dict = Field(
        default={
            "gemini":       1_000_000,
            "deepseek":        64_000,
            "zhipu":          128_000,
            "coze":            16_000,
            "local_ollama":     8_192,
        }
    )
    # ── RAG Cache ────────────────────────────────────────────────
    RAG_CACHE_TTL_SECONDS: int = 1800
    RAG_CACHE_MAX_ENTRIES: int = 2000
    RAG_SEMANTIC_CACHE_ENABLED: bool = True
    RAG_SEMANTIC_CACHE_THRESHOLD: float = 0.92
    RAG_SEMANTIC_CACHE_MAX_ENTRIES: int = 200
    RAG_VECTOR_SIMILARITY_THRESHOLD: float = 0.35
    RAG_RELEVANCE_THRESHOLD: float = 0.60
    RAG_POSTCHECK_OVERLAP_THRESHOLD: float = 0.18
    RAG_PDF_MAX_PAGES: int = 200
    RAG_EXTRACTION_TIMEOUT_SECONDS: float = 180.0
    RAG_OCR_DPI: int = 300
    RAG_INDEX_SCHEMA_VERSION: int = 2
    RAG_INDEX_DEFAULT_PROFILE: str = "quality"
    RAG_INDEX_DEFAULT_PARSER_STRATEGY: str = "auto"
    RAG_ENABLE_DOCLING: bool = True

    # ── Upload / folder paths ─────────────────────────────────────────
    UPLOAD_FOLDER: str = ""
    MAX_CONTENT_LENGTH: int = 50 * 1024 * 1024  # 50 MB
    MARKDOWN_FOLDER: str = ""
    HIGHLIGHTS_FOLDER: str = ""
    SUB1_UPLOAD_FOLDER: str = ""
    SUB1_MD_FOLDER: str = ""
    SUB1_HIGHLIGHTS_FOLDER: str = ""
    PPT_TEMPLATES_FOLDER: str = ""
    PPT_RESULTS_FOLDER: str = ""
    SCRIPT_RESULTS_FOLDER: str = ""

    # Sub2
    UPLOAD_FOLDER_SUB2: str = ""
    GENERATED_FOLDER_SUB2: str = ""
    SCREENSHOTS_FOLDER_SUB2: str = ""
    KNOWLEDGE_BASE_UPLOAD_DIR: str = ""
    ALLOWED_EXTENSIONS_SUB2: ClassVar[set[str]] = {"pdf", "png", "jpg", "jpeg"}
    SUB2_FILE_TTL_HOURS: int = 72
    SUB2_UPLOAD_FILE_TTL_HOURS: int = 2160

    # ── OCR / question generation ─────────────────────────────────────
    TEXTIN_API_KEY: str | None = None
    TEXTIN_SECRET_CODE: str | None = None
    TESSERACT_CMD: str | None = None

    # ── Handwriting OCR (PaddleOCR) ───────────────────────────────────
    HANDWRITING_OCR_ENABLED: bool = True       # set False to skip PaddleOCR entirely
    HANDWRITING_OCR_DPI: int = 200             # render resolution (200 suits handwriting)
    HANDWRITING_OCR_CONFIDENCE: float = 0.5   # discard PaddleOCR results below this
    HANDWRITING_OCR_MAX_PAGES: int = 30        # cap pages processed per submission

    # ── Chat / transfer ───────────────────────────────────────────────
    CHAT_AI_ENABLED: bool = True
    CHAT_TRANSFER_ENABLED: bool = True
    CHAT_TRANSFER_TICKET_TTL_HOURS: int = 24
    CHAT_AI_CONTEXT_WINDOW: int = 50
    CHAT_FILE_MAX_MB: int = 20

    # ── Web Search (SearXNG — self-hosted, no API key needed) ─────────
    SEARXNG_ENABLED: bool = False
    SEARXNG_BASE_URL: str = "http://localhost:8080"
    SEARXNG_MAX_RESULTS: int = 5
    SEARXNG_TIMEOUT_SECONDS: float = 6.0
    SEARXNG_FETCH_CONTENT: bool = False        # True → scrape full page text
    SEARXNG_CONTENT_MAX_CHARS: int = 1200      # chars kept per web result

    # ── Misc ──────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # Business constant (not from env, kept as ClassVar)
    DIFFICULTY_MAP: ClassVar[dict[int, str]] = {
        1: "Basic", 2: "Easy", 3: "Medium", 4: "Difficult", 5: "Competition Level"
    }

    # ── Validators ────────────────────────────────────────────────────

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _upper_log_level(cls, v: str) -> str:
        return str(v or "INFO").upper()

    @field_validator("OLLAMA_BASE_URL", mode="before")
    @classmethod
    def _strip_ollama_url(cls, v: str) -> str:
        return (str(v or "http://localhost:11434") or "").strip().rstrip("/")

    @field_validator("RAG_COLBERT_ENDPOINT", "RAG_OPENSEARCH_ENDPOINT", mode="before")
    @classmethod
    def _strip_optional_urls(cls, v: str) -> str:
        return (str(v or "") or "").strip().rstrip("/")

    @field_validator("RAG_OPENSEARCH_INDEX_PREFIX", mode="before")
    @classmethod
    def _normalize_opensearch_index_prefix(cls, v: str) -> str:
        raw = str(v or "course-rag").strip().lower()
        normalized = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in raw)
        normalized = normalized.strip("-_")
        while "--" in normalized:
            normalized = normalized.replace("--", "-")
        return normalized or "course-rag"

    @field_validator("RAG_OPENSEARCH_TIMEOUT_SECONDS", mode="before")
    @classmethod
    def _clamp_opensearch_timeout(cls, v) -> float:
        return max(1.0, min(60.0, float(v or 5.0)))

    @field_validator("JWT_COOKIE_SAMESITE", mode="before")
    @classmethod
    def _lower_samesite(cls, v: str) -> str:
        return str(v or "lax").strip().lower()

    @field_validator("COZE_REQUEST_TIMEOUT_SECONDS", mode="before")
    @classmethod
    def _clamp_coze_timeout(cls, v) -> float:
        return max(5.0, min(300.0, float(v or 90.0)))

    @field_validator("COZE_POLL_INTERVAL_SECONDS", mode="before")
    @classmethod
    def _clamp_coze_poll_interval(cls, v) -> float:
        return max(0.5, min(30.0, float(v or 1.2)))

    @field_validator("AI_DEFAULT_PROVIDER", mode="before")
    @classmethod
    def _normalize_provider(cls, v: str) -> str:
        return str(v or "local_ollama").strip().lower()

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, v) -> list[str]:
        default = ["http://localhost:5173", "http://127.0.0.1:5173"]
        if v is None:
            return default
        if isinstance(v, (list, tuple, set)):
            return [str(item).strip() for item in v if str(item).strip()]

        raw = str(v).strip()
        if not raw:
            return default

        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]

        return [item.strip() for item in raw.split(",") if item.strip()]

    @model_validator(mode="after")
    def _set_defaults_and_env_flags(self) -> "Settings":
        env = self.ENV.lower()
        sensitive = _is_sensitive(env)

        # Auto-generate strong random secrets if none provided.
        if not self.SECRET_KEY:
            generated = os.urandom(32).hex()
            object.__setattr__(self, "SECRET_KEY", generated)
            import logging
            logging.getLogger("config").warning(
                "SECRET_KEY was not set — using auto-generated key for this session. "
                "Set SECRET_KEY in .env for persistent sessions across restarts."
            )
        if not self.JWT_SECRET_KEY:
            generated = os.urandom(32).hex()
            object.__setattr__(self, "JWT_SECRET_KEY", generated)
            import logging
            logging.getLogger("config").warning(
                "JWT_SECRET_KEY was not set — using auto-generated key for this session. "
                "Set JWT_SECRET_KEY in .env for persistent sessions across restarts."
            )

        # JWT_COOKIE_CSRF_PROTECT defaults to True in sensitive envs
        # (only override if the field is still at its pydantic default of False)
        if os.getenv("JWT_COOKIE_CSRF_PROTECT") is None:
            object.__setattr__(self, "JWT_COOKIE_CSRF_PROTECT", sensitive)

        # JWT_COOKIE_SECURE defaults to True in sensitive envs
        jwt_secure_env = os.getenv("JWT_COOKIE_SECURE")
        if jwt_secure_env is None:
            object.__setattr__(self, "JWT_COOKIE_SECURE", sensitive)

        # Derive path fields that weren't explicitly set via env
        base = _BASE_DIR

        def _default(field: str, fallback: str) -> None:
            if not getattr(self, field):
                object.__setattr__(self, field, fallback)

        _default("RAG_VECTORSTORE_DIR", os.path.join(base, "generated", "vectorstore"))
        _default("UPLOAD_FOLDER", os.path.join(base, "uploads"))
        _default("MARKDOWN_FOLDER", os.path.join(base, "md"))
        _default("HIGHLIGHTS_FOLDER", os.path.join(base, "highlights"))
        _default("SUB1_UPLOAD_FOLDER", os.path.join(base, "uploads", "sub1"))
        _default("SUB1_MD_FOLDER", os.path.join(base, "md", "sub1"))
        _default("SUB1_HIGHLIGHTS_FOLDER", os.path.join(base, "highlights", "sub1"))
        _default("PPT_TEMPLATES_FOLDER", os.path.join(base, "static", "ppt_templates"))
        _default("PPT_RESULTS_FOLDER", os.path.join(base, "static", "ppt_results", "sub1"))
        _default("SCRIPT_RESULTS_FOLDER", os.path.join(base, "static", "script_results", "sub1"))
        _default("UPLOAD_FOLDER_SUB2", os.path.join(base, "uploads", "sub2"))
        _default("GENERATED_FOLDER_SUB2", os.path.join(base, "generated", "sub2"))
        _default("SCREENSHOTS_FOLDER_SUB2", os.path.join(base, "static", "sub2", "screenshots"))
        _default("KNOWLEDGE_BASE_UPLOAD_DIR", os.path.join(base, "uploads", "knowledge_base"))

        return self

    @property
    def ALL_FOLDERS(self) -> list[str]:
        """Ordered, deduplicated list of folders to create at startup."""
        raw = [
            self.UPLOAD_FOLDER, self.MARKDOWN_FOLDER, self.HIGHLIGHTS_FOLDER,
            self.PPT_TEMPLATES_FOLDER, self.PPT_RESULTS_FOLDER, self.SCRIPT_RESULTS_FOLDER,
            os.path.join(_BASE_DIR, "uploads/sub1"),
            os.path.join(_BASE_DIR, "md/sub1"),
            os.path.join(_BASE_DIR, "highlights/sub1"),
            os.path.join(_BASE_DIR, "static", "ppt_results", "sub1"),
            os.path.join(_BASE_DIR, "static", "script_results", "sub1"),
            self.UPLOAD_FOLDER_SUB2,
            self.GENERATED_FOLDER_SUB2,
            self.SCREENSHOTS_FOLDER_SUB2,
            os.path.join(_BASE_DIR, "uploads/sub4"),
            os.path.join(_BASE_DIR, "static/sub4/results"),
            os.path.join(_BASE_DIR, "uploads/sub5"),
            os.path.join(_BASE_DIR, "generated/sub5"),
            self.KNOWLEDGE_BASE_UPLOAD_DIR,
            self.RAG_VECTORSTORE_DIR,
            os.path.join(_BASE_DIR, "uploads/submissions"),
            os.path.join(_BASE_DIR, "uploads/homeworks"),
        ]
        return list(dict.fromkeys(raw))

    def validate_startup(self) -> list[str]:
        """Check critical config on startup. Returns list of warnings.
        Raises SystemExit for insecure defaults in non-dev environments."""
        import logging as _logging
        _logger = _logging.getLogger("config.validation")
        warnings: list[str] = []

        def _shannon_entropy_per_char(value: str) -> float:
            if not value:
                return 0.0
            counts = Counter(value)
            length = len(value)
            entropy = 0.0
            for count in counts.values():
                p = count / length
                entropy -= p * math.log2(p)
            return entropy

        def _key_strength_issues(key_value: str, key_name: str) -> list[str]:
            value = str(key_value or "")
            lowered = value.lower()
            issues: list[str] = []
            weak_markers = {
                'your-secret-key', 'jwt-secret-key-change-this-in-prod',
                'change-this', 'secret', 'default', 'password',
            }
            if not value.strip():
                issues.append(f"{key_name} is empty")
                return issues
            if len(value) < 32:
                issues.append(f"{key_name} length must be >= 32")
            classes = 0
            classes += 1 if any(c.islower() for c in value) else 0
            classes += 1 if any(c.isupper() for c in value) else 0
            classes += 1 if any(c.isdigit() for c in value) else 0
            classes += 1 if any(not c.isalnum() for c in value) else 0
            if classes < 3:
                issues.append(f"{key_name} must include at least 3 character classes")
            entropy = _shannon_entropy_per_char(value)
            if entropy < 3.0:
                issues.append(f"{key_name} entropy too low ({entropy:.2f} bits/char)")
            if lowered in weak_markers or any(marker in lowered for marker in weak_markers):
                issues.append(f"{key_name} appears to use a weak/default pattern")
            return issues

        sensitive_env = _is_sensitive(self.ENV)
        secret_issues = _key_strength_issues(self.SECRET_KEY, 'SECRET_KEY')
        jwt_issues = _key_strength_issues(self.JWT_SECRET_KEY, 'JWT_SECRET_KEY')

        for msg in [*secret_issues, *jwt_issues]:
            if sensitive_env:
                _logger.critical("CRITICAL CONFIG: %s", msg)
            else:
                _logger.warning("DEV SECURITY WARNING: %s", msg)
                warnings.append(msg)

        if sensitive_env and (secret_issues or jwt_issues):
            raise SystemExit(
                "Refusing to start: SECRET_KEY/JWT_SECRET_KEY failed security checks. "
                "Use strong random values with >=32 chars and high entropy."
            )

        valid_samesite = {'lax', 'strict', 'none'}
        if self.JWT_COOKIE_SAMESITE not in valid_samesite:
            msg = f"JWT_COOKIE_SAMESITE must be one of {sorted(valid_samesite)}"
            if sensitive_env:
                _logger.critical(msg)
                raise SystemExit(f"Refusing to start: {msg}")
            _logger.warning("DEV SECURITY WARNING: %s", msg)
            warnings.append(msg)

        if sensitive_env and not self.JWT_COOKIE_SECURE:
            msg = "JWT_COOKIE_SECURE must be true in production/staging environments"
            _logger.critical(msg)
            raise SystemExit(f"Refusing to start: {msg}")

        optional_keys = {
            'DEEPSEEK_API_KEY': self.DEEPSEEK_API_KEY,
            'COZE_TOKEN': self.COZE_TOKEN,
        }
        for name, value in optional_keys.items():
            if not value:
                msg = f"CONFIG: {name} is not set — related features will be degraded."
                warnings.append(msg)
                _logger.info(msg)

        if self.RAG_OPENSEARCH_ENABLED and not self.RAG_OPENSEARCH_ENDPOINT:
            msg = "RAG_OPENSEARCH_ENABLED is true but RAG_OPENSEARCH_ENDPOINT is empty"
            warnings.append(msg)
            _logger.warning(msg)

        if self.RAG_OPENSEARCH_PASSWORD and not self.RAG_OPENSEARCH_USERNAME:
            msg = "RAG_OPENSEARCH_PASSWORD is set but RAG_OPENSEARCH_USERNAME is empty"
            warnings.append(msg)
            _logger.warning(msg)

        return warnings


# ---------------------------------------------------------------------------
# Public singleton — drop-in for the old class-attribute-style Config usage
# ---------------------------------------------------------------------------
Config = Settings()
