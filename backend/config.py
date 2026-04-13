import os
import math
from collections import Counter
from dotenv import load_dotenv
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
ENV_NAME = os.getenv('ENV', 'development').lower()
SENSITIVE_ENVS = ('production', 'prod', 'staging', 'preprod')


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() == 'true'


def _env_csv(name: str, default: str) -> list[str]:
    return [
        item.strip()
        for item in os.getenv(name, default).split(',')
        if item.strip()
    ]

load_dotenv()
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    BASE_DIR = BASE_DIR

    ENV = ENV_NAME
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key')

    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-this-in-prod')
    JWT_TOKEN_LOCATION = ['cookies']
    # CSRF protection defaults to True in sensitive envs and False in development.
    JWT_COOKIE_CSRF_PROTECT = _env_bool('JWT_COOKIE_CSRF_PROTECT', default=ENV_NAME in SENSITIVE_ENVS)
    JWT_ACCESS_COOKIE_NAME = 'access_token_cookie'
    JWT_COOKIE_SAMESITE = os.getenv('JWT_COOKIE_SAMESITE', 'lax').strip().lower()
    _jwt_cookie_secure_env = os.getenv('JWT_COOKIE_SECURE')
    JWT_COOKIE_SECURE = (
        _jwt_cookie_secure_env.strip().lower() == 'true'
        if isinstance(_jwt_cookie_secure_env, str) and _jwt_cookie_secure_env.strip()
        else (ENV_NAME in SENSITIVE_ENVS)
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv('JWT_EXPIRES_HOURS', '24')))

    SERP_API_KEY = os.getenv('SERP_API_KEY')
    DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/intelligent_edu')

    ZHIPU_API_KEY = os.getenv('ZHIPU_API_KEY')
    COZE_TOKEN = os.getenv('COZE_TOKEN')
    COZE_BOT_ID = os.getenv('COZE_BOT_ID')
    COZE_API_BASE = os.getenv('COZE_API_BASE', 'https://api.coze.com/v3/chat')
    COZE_API_ROOT = "https://api.coze.com"
    COZE_REQUEST_TIMEOUT_SECONDS = float(os.getenv('COZE_REQUEST_TIMEOUT_SECONDS', '90'))
    COZE_POLL_INTERVAL_SECONDS = float(os.getenv('COZE_POLL_INTERVAL_SECONDS', '1.2'))
    COZE_POLL_MAX_ATTEMPTS = int(os.getenv('COZE_POLL_MAX_ATTEMPTS', '50'))

    AI_DEFAULT_PROVIDER = os.getenv('AI_DEFAULT_PROVIDER', 'local_ollama').strip().lower()
    AI_ALLOW_PROVIDER_SWITCH = _env_bool('AI_ALLOW_PROVIDER_SWITCH', default=True)

    # OLLAMA_BASE_URL = (os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434') or '').strip().rstrip('/')
    OLLAMA_BASE_URL = (os.getenv('OLLAMA_BASE_URL', 'http://hp-z2-hcwu:11434') or '').strip().rstrip('/')
    OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2-vision:11b').strip()
    OLLAMA_REQUEST_TIMEOUT_SECONDS = float(os.getenv('OLLAMA_REQUEST_TIMEOUT_SECONDS', '180'))
    OLLAMA_LIGHT_TEMPERATURE = float(os.getenv('OLLAMA_LIGHT_TEMPERATURE', '0.2'))
    OLLAMA_LIGHT_NUM_PREDICT = int(os.getenv('OLLAMA_LIGHT_NUM_PREDICT', '256'))
    OLLAMA_LIGHT_NUM_CTX = int(os.getenv('OLLAMA_LIGHT_NUM_CTX', '4096'))
    OLLAMA_HEAVY_TEMPERATURE = float(os.getenv('OLLAMA_HEAVY_TEMPERATURE', '0.4'))
    OLLAMA_HEAVY_NUM_PREDICT = int(os.getenv('OLLAMA_HEAVY_NUM_PREDICT', '1024'))
    OLLAMA_HEAVY_NUM_CTX = int(os.getenv('OLLAMA_HEAVY_NUM_CTX', '8192'))

    # RAG / vector store
    RAG_VECTORSTORE_DIR = os.getenv(
        'RAG_VECTORSTORE_DIR',
        os.path.join(BASE_DIR, 'generated', 'vectorstore'),
    )
    RAG_EMBEDDING_MODEL = os.getenv('RAG_EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')
    RAG_TWO_STAGE_CHAT_ENABLED = _env_bool('RAG_TWO_STAGE_CHAT_ENABLED', default=True)
    RAG_EMPTY_RETRY_ENABLED = _env_bool('RAG_EMPTY_RETRY_ENABLED', default=True)
    RAG_POSTCHECK_ENABLED = _env_bool('RAG_POSTCHECK_ENABLED', default=True)
    RAG_RETRIEVE_TOP_N = int(os.getenv('RAG_RETRIEVE_TOP_N', '10'))
    RAG_ANSWER_TOP_K = int(os.getenv('RAG_ANSWER_TOP_K', '4'))
    RAG_EVIDENCE_MAX_CHARS = int(os.getenv('RAG_EVIDENCE_MAX_CHARS', '1600'))
    RAG_EVIDENCE_MAX_CHARS_PER_CHUNK = int(os.getenv('RAG_EVIDENCE_MAX_CHARS_PER_CHUNK', '420'))


    # ==========================
    # Global and Sub1 folder config
    # ==========================
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', str(50 * 1024 * 1024)))  # 50MB default
    MARKDOWN_FOLDER = os.path.join(BASE_DIR, 'md')
    HIGHLIGHTS_FOLDER = os.path.join(BASE_DIR, 'highlights')

    SUB1_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'sub1')
    SUB1_MD_FOLDER = os.path.join(MARKDOWN_FOLDER, 'sub1')
    SUB1_HIGHLIGHTS_FOLDER = os.path.join(HIGHLIGHTS_FOLDER, 'sub1')

    PPT_TEMPLATES_FOLDER = os.path.join(BASE_DIR, 'static', 'ppt_templates')
    PPT_RESULTS_FOLDER = os.path.join(BASE_DIR, 'static', 'ppt_results', 'sub1')
    SCRIPT_RESULTS_FOLDER = os.path.join(BASE_DIR, 'static', 'script_results', 'sub1')

    # ==========================
    # Sub2 specific config (question extraction and generation)
    # ==========================
    # Path config
    UPLOAD_FOLDER_SUB2 = os.path.join(BASE_DIR, 'uploads', 'sub2')
    GENERATED_FOLDER_SUB2 = os.path.join(BASE_DIR, 'generated', 'sub2')
    SCREENSHOTS_FOLDER_SUB2 = os.path.join(BASE_DIR, 'static', 'sub2', 'screenshots')
    KNOWLEDGE_BASE_UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads', 'knowledge_base')

    ALLOWED_EXTENSIONS_SUB2 = {'pdf', 'png', 'jpg', 'jpeg'}

    # File lifecycle: auto-clean files older than this many hours
    SUB2_FILE_TTL_HOURS = int(os.getenv('SUB2_FILE_TTL_HOURS', '72'))
    # Upload source files are kept longer to preserve replay capability for history records
    SUB2_UPLOAD_FILE_TTL_HOURS = int(os.getenv('SUB2_UPLOAD_FILE_TTL_HOURS', '2160'))

    # API keys and service endpoints (read from env first)
    TEXTIN_API_KEY = os.getenv('TEXTIN_API_KEY')
    TEXTIN_SECRET_CODE = os.getenv('TEXTIN_SECRET_CODE')

    QUESTION_GENERATION_API_URL = os.getenv('QUESTION_GENERATION_API_URL')
    QUESTION_GENERATION_API_KEY = os.getenv('QUESTION_GENERATION_API_KEY')

    LOCAL_DEEPSEEK_API_URL = os.getenv('LOCAL_DEEPSEEK_API_URL')
    LOCAL_DEEPSEEK_MODEL = os.getenv('LOCAL_DEEPSEEK_MODEL')

    # OCR engine config
    TESSERACT_CMD = os.getenv('TESSERACT_CMD')

    # ==========================
    # Chat AI & Transfer Station
    # ==========================
    CHAT_AI_ENABLED = _env_bool('CHAT_AI_ENABLED', default=True)
    CHAT_TRANSFER_ENABLED = _env_bool('CHAT_TRANSFER_ENABLED', default=True)
    CHAT_TRANSFER_TICKET_TTL_HOURS = int(os.getenv('CHAT_TRANSFER_TICKET_TTL_HOURS', '24'))
    CHAT_AI_CONTEXT_WINDOW = int(os.getenv('CHAT_AI_CONTEXT_WINDOW', '50'))
    CHAT_FILE_MAX_MB = int(os.getenv('CHAT_FILE_MAX_MB', '20'))

    # Business constant mapping
    DIFFICULTY_MAP = {1: "Basic", 2: "Easy", 3: "Medium", 4: "Difficult", 5: "Competition Level"}

    # ==========================
    # Folder creation list (used by app startup)
    # ==========================
    _ALL_FOLDERS_RAW = [
        UPLOAD_FOLDER, MARKDOWN_FOLDER, HIGHLIGHTS_FOLDER, PPT_TEMPLATES_FOLDER,
        PPT_RESULTS_FOLDER, SCRIPT_RESULTS_FOLDER,
        os.path.join(BASE_DIR, 'uploads/sub1'),
        os.path.join(BASE_DIR, 'md/sub1'),
        os.path.join(BASE_DIR, 'highlights/sub1'),
        os.path.join(BASE_DIR, 'static', 'ppt_results', 'sub1'),
        os.path.join(BASE_DIR, 'static', 'script_results', 'sub1'),

        # Keep naming consistent: use sub2 paths (not legacy sub3 naming).
        UPLOAD_FOLDER_SUB2,
        GENERATED_FOLDER_SUB2,
        SCREENSHOTS_FOLDER_SUB2,

        os.path.join(BASE_DIR, 'uploads/sub4'),
        os.path.join(BASE_DIR, 'static/sub4/results'),

        os.path.join(BASE_DIR, 'uploads/sub5'),
        os.path.join(BASE_DIR, 'generated/sub5'),
        KNOWLEDGE_BASE_UPLOAD_DIR,
        RAG_VECTORSTORE_DIR,
        os.path.join(BASE_DIR, 'uploads/submissions'),
        os.path.join(BASE_DIR, 'uploads/homeworks'),
    ]
    ALL_FOLDERS = list(dict.fromkeys(_ALL_FOLDERS_RAW))

    # Comma-separated allowed origins for CORS (read from env, defaults to dev)
    ALLOWED_ORIGINS = _env_csv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')

    @classmethod
    def validate_startup(cls) -> list[str]:
        """Check critical config on startup. Returns list of warnings.
        Raises SystemExit for insecure defaults in non-dev environments."""
        import logging
        _logger = logging.getLogger("config.validation")
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
                'your-secret-key',
                'jwt-secret-key-change-this-in-prod',
                'change-this',
                'secret',
                'default',
                'password',
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

        sensitive_env = cls.ENV in SENSITIVE_ENVS

        secret_issues = _key_strength_issues(cls.SECRET_KEY, 'SECRET_KEY')
        jwt_issues = _key_strength_issues(cls.JWT_SECRET_KEY, 'JWT_SECRET_KEY')

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
        if cls.JWT_COOKIE_SAMESITE not in valid_samesite:
            msg = f"JWT_COOKIE_SAMESITE must be one of {sorted(valid_samesite)}"
            if sensitive_env:
                _logger.critical(msg)
                raise SystemExit(f"Refusing to start: {msg}")
            _logger.warning("DEV SECURITY WARNING: %s", msg)
            warnings.append(msg)

        if sensitive_env and not cls.JWT_COOKIE_SECURE:
            msg = "JWT_COOKIE_SECURE must be true in production/staging environments"
            _logger.critical(msg)
            raise SystemExit(f"Refusing to start: {msg}")

        optional_keys = {
            'DEEPSEEK_API_KEY': cls.DEEPSEEK_API_KEY,
            'COZE_TOKEN': cls.COZE_TOKEN,
            'ZHIPU_API_KEY': cls.ZHIPU_API_KEY,
        }
        for name, value in optional_keys.items():
            if not value:
                msg = f"CONFIG: {name} is not set — related features will be degraded."
                warnings.append(msg)
                _logger.info(msg)

        return warnings