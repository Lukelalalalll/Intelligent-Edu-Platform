from backend.extensions import mongo
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId

class User:
    @staticmethod
    def get_by_username(username):
        return mongo.db.users.find_one({"username": username})

    @staticmethod
    def get_by_id(user_id):
        return mongo.db.users.find_one({"_id": ObjectId(user_id)})

    @staticmethod
    def create_user(username, email, password, role='teacher'):
        user_doc = {
            "username": username,
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": role
        }
        return mongo.db.users.insert_one(user_doc)