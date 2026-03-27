import os
from dotenv import load_dotenv
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

load_dotenv()
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    BASE_DIR = BASE_DIR

    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

    SECRET_KEY = 'your-secret-key'

    JWT_SECRET_KEY = 'jwt-secret-key-change-this-in-prod'
    JWT_TOKEN_LOCATION = ['cookies']
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_COOKIE_NAME = 'access_token_cookie'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=30)

    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'users.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SERP_API_KEY = os.getenv('SERP_API_KEY')
    DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
    MONGO_URI = "mongodb://localhost:27017/intelligent_edu"

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
    GMAIL_REDIRECT_URI = os.getenv('GMAIL_REDIRECT_URI', 'http://localhost:5173/gmail/callback')


    # ==========================
    # 全局及 Sub1 文件夹配置
    # ==========================
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024
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