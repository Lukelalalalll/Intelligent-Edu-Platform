from app import create_app
from extensions import db
from models import User

def create_admin_user():
    app = create_app()
    with app.app_context():
        # 1. 确保数据库表已存在
        db.create_all()

        # 2. 检查是否已经存在管理员
        admin_username = 'admin'
        existing_user = User.query.filter_by(username=admin_username).first()

        if existing_user:
            print(f"用户 {admin_username} 已存在，正在更新为管理员权限...")
            existing_user.role = 'admin'
            existing_user.set_password('123456') # 统一重置一下
        else:
            print(f"正在创建新的管理员用户 {admin_username} ...")
            new_admin = User(username=admin_username, email='admin@example.com', role='admin')
            new_admin.set_password('123456')
            db.session.add(new_admin)

        try:
            db.session.commit()
            print(">>> 管理员账户设置成功！用户名: admin 密码: 123456")
        except Exception as e:
            db.session.rollback()
            print(f"发生错误: {e}")

if __name__ == "__main__":
    create_admin_user()