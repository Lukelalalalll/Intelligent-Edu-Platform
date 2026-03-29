"""Create admin user using the current FastAPI/MongoDB stack."""
from pymongo import MongoClient
from werkzeug.security import generate_password_hash
from backend.config import Config


def create_admin_user():
    client = MongoClient(Config.MONGO_URI)
    db = client.get_default_database()

    existing = db.users.find_one({"username": "admin"})
    if not existing:
        db.users.insert_one({
            "username": "admin",
            "email": "admin@hku.hk",
            "password_hash": generate_password_hash("123456"),
            "role": "admin",
            "teacherCourseIds": [],
        })
        print(">>> Admin user created successfully!")
    else:
        print(">>> Admin user already exists.")


if __name__ == "__main__":
    create_admin_user()