import os
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

load_dotenv()

class Config:
    BASE_DIR = BASE_DIR

    SECRET_KEY = 'your-secret-key'

    JWT_SECRET_KEY = 'jwt-secret-key-change-this-in-prod'
    JWT_TOKEN_LOCATION = ['cookies']
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_COOKIE_NAME = 'access_token_cookie'

    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'users.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SERP_API_KEY = os.getenv('SERP_API_KEY')
    DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
    MONGO_URI = "mongodb://localhost:27017/intelligent_edu"

    COZE_TOKEN = os.getenv('COZE_TOKEN')
    COZE_BOT_ID = os.getenv('COZE_BOT_ID')
    COZE_API_BASE = os.getenv('COZE_API_BASE', 'https://api.coze.com/v3/chat')


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

    ALL_FOLDERS = [
        UPLOAD_FOLDER, MARKDOWN_FOLDER, HIGHLIGHTS_FOLDER, PPT_TEMPLATES_FOLDER,
        PPT_RESULTS_FOLDER, SCRIPT_RESULTS_FOLDER,
        os.path.join(BASE_DIR, 'uploads/sub1'), os.path.join(BASE_DIR, 'md/sub1'),
        os.path.join(BASE_DIR, 'highlights/sub1'), os.path.join(BASE_DIR, 'static/ppt_results/sub1'),
        os.path.join(BASE_DIR, 'static/script_results/sub1'),
        os.path.join(BASE_DIR, 'uploads/sub3'), os.path.join(BASE_DIR, 'generated/sub3'),
        os.path.join(BASE_DIR, 'static/sub3/screenshots'),
        os.path.join(BASE_DIR, 'uploads/sub4'), os.path.join(BASE_DIR, 'static/sub4/results'),
        os.path.join(BASE_DIR, 'uploads/sub5'), os.path.join(BASE_DIR, 'generated/sub5'),
    ]