# backend/routes/auth_routes.py
from fastapi import APIRouter, Depends, HTTPException, Response
from werkzeug.security import generate_password_hash, check_password_hash
from backend.core.database import db
from backend.core.security import create_access_token, get_current_user
from backend.schemas import AuthSchema, UpdateProfileSchema
from backend.config import Config

auth_router = APIRouter(prefix="/api", tags=["Auth"])


@auth_router.post("/register")
async def register(req: AuthSchema):
    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=409, detail="Username already exists")

    user_doc = {
        "username": req.username,
        "email": req.email,
        "password_hash": generate_password_hash(req.password),
        "role": "student"
    }
    await db.users.insert_one(user_doc)
    return {"message": "Account created successfully"}


@auth_router.post("/login")
async def login(req: AuthSchema, response: Response):
    user = await db.users.find_one({"username": req.username})
    if not user or not check_password_hash(user['password_hash'], req.password):
        raise HTTPException(status_code=401, detail="Wrong username or password")

    access_token = create_access_token(data={"sub": str(user["_id"])})

    # 设置 HttpOnly Cookie
    response.set_cookie(
        key=Config.JWT_ACCESS_COOKIE_NAME, value=access_token,
        httponly=True, samesite="lax"
    )

    return {
        "message": "Login successful",
        "user": {"id": str(user["_id"]), "username": user["username"], "email": user.get("email"),
                 "role": user.get("role", "teacher")}
    }


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(Config.JWT_ACCESS_COOKIE_NAME)
    return {"message": "Logout successful"}


@auth_router.post("/profile/update")
async def update_profile(req: UpdateProfileSchema, current_user: dict = Depends(get_current_user)):
    update_data = {}
    if req.username: update_data["username"] = req.username
    if req.email: update_data["email"] = req.email
    if req.password: update_data["password_hash"] = generate_password_hash(req.password)

    if update_data:
        await db.users.update_one({"_id": current_user["_id"]}, {"$set": update_data})
    return {"message": "Profile updated successfully"}