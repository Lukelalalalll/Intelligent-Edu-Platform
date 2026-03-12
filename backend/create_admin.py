from backend.app import create_app
from backend.models import User
from backend.extensions import mongo

def create_admin_user():
    app = create_app()
    with app.app_context():
        # 检查是否已存在
        if not User.get_by_username('admin'):
            User.create_user('admin', 'admin@hku.hk', '123456', role='admin')
            print(">>> MongoDB 管理员创建成功！")
        else:
            print(">>> 管理员已存在。")

if __name__ == "__main__":
    create_admin_user()