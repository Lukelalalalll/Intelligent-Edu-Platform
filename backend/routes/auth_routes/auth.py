"""Authentication endpoints: register, login, logout, session, profile update, reset-password."""
from __future__ import annotations

import os
import logging

from fastapi import Depends, HTTPException, Request, Response
from werkzeug.security import generate_password_hash, check_password_hash

from backend.core.database import db
from backend.core.security import create_access_token, get_current_user
from backend.schemas import AuthSchema, UpdateProfileSchema, ResetPasswordSchema
from backend.config import Config
from backend.services.security_audit import log_security_event
from .router import auth_router, limiter

logger = logging.getLogger(__name__)


@auth_router.post("/register")
@limiter.limit("10/minute")
async def register(request: Request, req: AuthSchema):
    # Password strength validation
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isdigit() for c in req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=409, detail="Username already exists")

    # Determine role via staff code
    role = "student"
    if req.staff_code:
        from datetime import datetime, timezone
        code = req.staff_code.strip().upper()
        code_doc = await db.staff_codes.find_one({"code": code, "is_used": False})
        if not code_doc:
            raise HTTPException(status_code=400, detail="Invalid or already-used staff code")
        if code_doc["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Staff code has expired")
        role = "teacher"

    user_doc = {
        "username": req.username,
        "email": req.email,
        "password_hash": generate_password_hash(req.password),
        "role": role,
        "teacherCourseIds": [],
    }
    result = await db.users.insert_one(user_doc)

    # Mark code as used after successful registration
    if req.staff_code and role == "teacher":
        from datetime import datetime, timezone
        await db.staff_codes.update_one(
            {"code": req.staff_code.strip().upper()},
            {"$set": {"is_used": True, "used_by": str(result.inserted_id), "used_at": datetime.now(timezone.utc)}}
        )

    return {"message": "Account created successfully"}


@auth_router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordSchema):
    """Reset a user's password after verifying username + email match."""
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isdigit() for c in req.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    user = await db.users.find_one({"username": req.username})
    # Use constant-time-like response to avoid user enumeration
    if not user or (user.get("email") or "").lower() != req.email.strip().lower():
        raise HTTPException(status_code=400, detail="Username and email do not match any account")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": generate_password_hash(req.new_password)}}
    )
    return {"message": "Password reset successfully"}


@auth_router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, req: AuthSchema, response: Response):
    request_id = getattr(request.state, "request_id", "unknown")
    user = await db.users.find_one({"username": req.username})
    if not user or not check_password_hash(user['password_hash'], req.password):
        log_security_event(
            level="warning",
            request_id=request_id,
            user_id="anonymous",
            endpoint="/api/login",
            action="login_failed",
            detail="invalid credentials",
            extra={"username": req.username[:64]},
        )
        raise HTTPException(status_code=401, detail="Wrong username or password")

    access_token = create_access_token(data={"sub": str(user["_id"])})

    # 设置 HttpOnly Cookie
    is_production = os.getenv('ENV', 'development').lower() in ('production', 'prod')
    samesite = Config.JWT_COOKIE_SAMESITE
    secure_cookie = Config.JWT_COOKIE_SECURE

    if is_production and (not secure_cookie or samesite == "none" and not secure_cookie):
        logger.error(
            "Refusing insecure auth cookie settings in production | rid=%s user=%s secure=%s samesite=%s",
            request_id,
            str(user.get("_id") or ""),
            secure_cookie,
            samesite,
        )
        raise HTTPException(status_code=500, detail="Server authentication cookie policy is misconfigured")

    response.set_cookie(
        key=Config.JWT_ACCESS_COOKIE_NAME, value=access_token,
        httponly=True,
        samesite=samesite,
        secure=secure_cookie if is_production else bool(secure_cookie),
    )

    log_security_event(
        level="info",
        request_id=request_id,
        user_id=str(user.get("_id") or ""),
        endpoint="/api/login",
        action="login_success",
        detail="user authenticated and cookie issued",
    )

    return {
        "message": "Login successful",
        "user": {"id": str(user["_id"]), "username": user["username"], "email": user.get("email"),
                 "role": user.get("role", "student"),
                 "teacherCourseIds": user.get("teacherCourseIds", [])}
    }


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(Config.JWT_ACCESS_COOKIE_NAME)
    return {"message": "Logout successful"}


@auth_router.get("/session")
async def get_session(current_user: dict = Depends(get_current_user)):
    return {
        "user": {
            "id": str(current_user.get("_id") or current_user.get("id") or ""),
            "username": current_user.get("username"),
            "email": current_user.get("email"),
            "role": current_user.get("role", "student"),
            "teacherCourseIds": current_user.get("teacherCourseIds", []),
        }
    }


@auth_router.post("/profile/update")
async def update_profile(req: UpdateProfileSchema, current_user: dict = Depends(get_current_user)):
    update_data = {}
    if req.username: update_data["username"] = req.username
    if req.email: update_data["email"] = req.email
    if req.password: update_data["password_hash"] = generate_password_hash(req.password)
    if req.teacherCourseIds is not None:
        update_data["teacherCourseIds"] = req.teacherCourseIds

    if update_data:
        await db.users.update_one({"_id": current_user["_id"]}, {"$set": update_data})
    return {"message": "Profile updated successfully"}
