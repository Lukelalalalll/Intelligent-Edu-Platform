import os
from dotenv import load_dotenv
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

load_dotenv()
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    BASE_DIR = BASE_DIR

    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key')

    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-this-in-prod')
    JWT_TOKEN_LOCATION = ['cookies']
    JWT_COOKIE_CSRF_PROTECT = os.getenv('JWT_COOKIE_CSRF_PROTECT', 'false').lower() == 'true'
    JWT_ACCESS_COOKIE_NAME = 'access_token_cookie'
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

    # RAG / Vector Store
    RAG_VECTORSTORE_DIR = os.getenv(
        'RAG_VECTORSTORE_DIR',
        os.path.join(BASE_DIR, 'generated', 'vectorstore'),
    )
    RAG_EMBEDDING_MODEL = os.getenv('RAG_EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')

    GMAIL_CLIENT_SECRET_FILE = os.getenv(
        'GMAIL_CLIENT_SECRET_FILE',
        os.path.join(BASE_DIR, 'client_secret_140717111384-2m1v2psqsarktrujhprth45hqg0hsck0.apps.googleusercontent.com.json'),
    )
    GMAIL_CLIENT_ID = os.getenv('GMAIL_CLIENT_ID')
    GMAIL_CLIENT_SECRET = os.getenv('GMAIL_CLIENT_SECRET')
    GMAIL_PROJECT_ID = os.getenv('GMAIL_PROJECT_ID', 'intelligent-edu-platform')
    GMAIL_AUTH_URI = os.getenv('GMAIL_AUTH_URI', 'https://accounts.google.com/o/oauth2/auth')
    GMAIL_TOKEN_URI = os.getenv('GMAIL_TOKEN_URI', 'https://oauth2.googleapis.com/token')
    GMAIL_AUTH_PROVIDER_X509_CERT_URL = os.getenv(
        'GMAIL_AUTH_PROVIDER_X509_CERT_URL',
        'https://www.googleapis.com/oauth2/v1/certs',
    )
    GMAIL_REDIRECT_URI = os.getenv('GMAIL_REDIRECT_URI', 'http://localhost:5173/gmail/callback')


    # ==========================
    # 全局及 Sub1 文件夹配置
    # ==========================
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', str(50 * 1024 * 1024)))  # 50MB default
    MARKDOWN_FOLDER = os.path.join(BASE_DIR, 'md')
    HIGHLIGHTS_FOLDER = os.path.join(BASE_DIR, 'highlights')

    SUB1_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'sub1')
    SUB1_MD_FOLDER = os.path.join(MARKDOWN_FOLDER, 'sub1')
    SUB1_HIGHLIGHTS_FOLDER = os.path.join(HIGHLIGHTS_FOLDER, 'sub1')

    PPT_TEMPLATES_FOLDER = os.path.join(BASE_DIR, 'static/ppt_templates')
    PPT_RESULTS_FOLDER = os.path.join(BASE_DIR, 'static/ppt_results/sub1')
    SCRIPT_RESULTS_FOLDER = os.path.join(BASE_DIR, 'static/script_results/sub1')

    # ==========================
    # Sub2 专属配置 (题目提取与生成)
    # ==========================
    # 路径配置
    UPLOAD_FOLDER_SUB2 = os.path.join(BASE_DIR, 'uploads', 'sub2')
    GENERATED_FOLDER_SUB2 = os.path.join(BASE_DIR, 'generated', 'sub2')
    SCREENSHOTS_FOLDER_SUB2 = os.path.join(BASE_DIR, 'static', 'sub2', 'screenshots')

    ALLOWED_EXTENSIONS_SUB2 = {'pdf', 'png', 'jpg', 'jpeg'}

    # File lifecycle: auto-clean files older than this many hours
    SUB2_FILE_TTL_HOURS = int(os.getenv('SUB2_FILE_TTL_HOURS', '72'))

    # API 密钥与服务地址 (优先读取环境变量，否则使用默认值)
    TEXTIN_API_KEY = os.getenv('TEXTIN_API_KEY')
    TEXTIN_SECRET_CODE = os.getenv('TEXTIN_SECRET_CODE')

    QUESTION_GENERATION_API_URL = os.getenv('QUESTION_GENERATION_API_URL')
    QUESTION_GENERATION_API_KEY = os.getenv('QUESTION_GENERATION_API_KEY')

    LOCAL_DEEPSEEK_API_URL = os.getenv('LOCAL_DEEPSEEK_API_URL')
    LOCAL_DEEPSEEK_MODEL = os.getenv('LOCAL_DEEPSEEK_MODEL')

    # OCR 引擎配置
    TESSERACT_CMD = os.getenv('TESSERACT_CMD')

    # 业务常量映射
    DIFFICULTY_MAP = {1: "Basic", 2: "Easy", 3: "Medium", 4: "Difficult", 5: "Competition Level"}

    # ==========================
    # 自动创建目录列表 (由 app.py 调用)
    # ==========================
    ALL_FOLDERS = [
        UPLOAD_FOLDER, MARKDOWN_FOLDER, HIGHLIGHTS_FOLDER, PPT_TEMPLATES_FOLDER,
        PPT_RESULTS_FOLDER, SCRIPT_RESULTS_FOLDER,
        os.path.join(BASE_DIR, 'uploads/sub1'),
        os.path.join(BASE_DIR, 'md/sub1'),
        os.path.join(BASE_DIR, 'highlights/sub1'),
        os.path.join(BASE_DIR, 'static/ppt_results/sub1'),
        os.path.join(BASE_DIR, 'static/script_results/sub1'),

        # 将原先写成 sub3 的地方全部修正为 sub2 保持项目一致性
        UPLOAD_FOLDER_SUB2,
        GENERATED_FOLDER_SUB2,
        SCREENSHOTS_FOLDER_SUB2,

        os.path.join(BASE_DIR, 'uploads/sub4'),
        os.path.join(BASE_DIR, 'static/sub4/results'),

        os.path.join(BASE_DIR, 'uploads/sub5'),
        os.path.join(BASE_DIR, 'generated/sub5'),
        RAG_VECTORSTORE_DIR,
    ]

    # Comma-separated allowed origins for CORS (read from env, defaults to dev)
    ALLOWED_ORIGINS = [
        o.strip() for o in
        os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
        if o.strip()
    ]

    @classmethod
    def validate_startup(cls) -> list[str]:
        """Check critical config on startup. Returns list of warnings.
        Raises SystemExit for insecure defaults in non-dev environments."""
        import logging
        _logger = logging.getLogger("config.validation")
        warnings: list[str] = []

        _insecure_defaults = {'your-secret-key', 'jwt-secret-key-change-this-in-prod', ''}
        if cls.SECRET_KEY in _insecure_defaults:
            msg = "CRITICAL: SECRET_KEY is using an insecure default. Set SECRET_KEY env variable!"
            warnings.append(msg)
            _logger.critical(msg)
        if cls.JWT_SECRET_KEY in _insecure_defaults:
            msg = "CRITICAL: JWT_SECRET_KEY is using an insecure default. Set JWT_SECRET_KEY env variable!"
            warnings.append(msg)
            _logger.critical(msg)

        # In production, refuse to start with insecure keys
        if os.getenv('ENV', 'development').lower() in ('production', 'prod'):
            if cls.SECRET_KEY in _insecure_defaults or cls.JWT_SECRET_KEY in _insecure_defaults:
                raise SystemExit("Refusing to start: SECRET_KEY and JWT_SECRET_KEY must be set in production.")

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