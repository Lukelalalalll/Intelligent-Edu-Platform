from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import Request, HTTPException, Depends
from backend.config import Config
from backend.core.database import db
from bson import ObjectId


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + Config.JWT_ACCESS_TOKEN_EXPIRES
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, Config.JWT_SECRET_KEY, algorithm="HS256")


async def get_current_user(request: Request):
    token = request.cookies.get(Config.JWT_ACCESS_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in first")
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    user["id"] = str(user["_id"])  # 将 ObjectId 转为字符串
    return user


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Permission denied")
    return current_user