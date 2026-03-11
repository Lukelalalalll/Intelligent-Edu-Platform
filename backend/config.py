import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = 'your-secret-key'

    JWT_SECRET_KEY = 'jwt-secret-key-change-this-in-prod'
    JWT_TOKEN_LOCATION = ['cookies']
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_COOKIE_NAME = 'access_token_cookie'

    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'users.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SERP_API_KEY = '6c5d8d8c5955aa47a3b5b008d34d83fa3e752cc9c6ffc995b712ebbfc7dd34f9'
    DEEPSEEK_API_KEY = 'sk-08b1b30e64944eb09250517419284fac'

    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024
    MARKDOWN_FOLDER = os.path.join(BASE_DIR, 'md')
    HIGHLIGHTS_FOLDER = os.path.join(BASE_DIR, 'highlights')
    PPT_TEMPLATES_FOLDER = os.path.join(BASE_DIR, 'static/ppt_templates')
    PPT_RESULTS_FOLDER = os.path.join(BASE_DIR, 'static/ppt_results')
    SCRIPT_RESULTS_FOLDER = os.path.join(BASE_DIR, 'static/script_results')

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