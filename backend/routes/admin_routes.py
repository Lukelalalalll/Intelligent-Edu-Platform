from fastapi import APIRouter, Depends, HTTPException
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash
from backend.core.database import db
from backend.core.security import get_admin_user
from backend.schemas import AuthSchema, UpdateProfileSchema

admin_router = APIRouter(prefix="/api/admin", tags=["Admin"])


@admin_router.get("/users")
async def get_users(admin: dict = Depends(get_admin_user)):
    users = await db.users.find().to_list(1000)
    return [{"id": str(u["_id"]), "username": u["username"], "email": u["email"], "role": u.get("role", "student")} for
            u in users]


@admin_router.post("/add_user")
async def add_user(req: AuthSchema, admin: dict = Depends(get_admin_user)):
    if await db.users.find_one({"username": req.username}):
        raise HTTPException(status_code=400, detail="Username already taken")
    user_doc = {
        "username": req.username, "email": req.email,
        "password_hash": generate_password_hash(req.password or '123456'),
        "role": req.role
    }
    await db.users.insert_one(user_doc)
    return {"message": "User created successfully"}


@admin_router.put("/update_user/{user_id}")
async def update_user(user_id: str, req: UpdateProfileSchema, admin: dict = Depends(get_admin_user)):
    if str(admin["_id"]) == user_id and req.role != 'admin':
        raise HTTPException(status_code=400, detail="Cannot remove your own admin status")

    update_data = {k: v for k, v in req.dict(exclude_unset=True).items() if k != "password"}
    if req.password: update_data["password_hash"] = generate_password_hash(req.password)

    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    return {"message": "User updated successfully"}


@admin_router.delete("/delete_user/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"message": "User deleted successfully"}