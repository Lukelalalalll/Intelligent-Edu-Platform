# backend/routes/gmail_routes.py
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.core.database import db
from backend.core.security import get_current_user
from backend.services.gmail_service import GmailService


gmail_router = APIRouter(prefix="/api/gmail", tags=["Gmail"])


class GmailCallbackSchema(BaseModel):
    code: str
    state: str | None = None


@gmail_router.get("/auth_url")
async def get_gmail_auth_url(request: Request, current_user: dict = Depends(get_current_user)):
    try:
        # 🌟 修复：同时获取生成的 code_verifier
        auth_url, state, code_verifier = await GmailService.build_auth_url()
        
        # 将 state 和 code_verifier 存入 session
        request.session["gmail_oauth_state"] = state
        request.session["gmail_code_verifier"] = code_verifier
        
        return {"auth_url": auth_url}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to generate Gmail auth url: {exc}")


@gmail_router.post("/callback")
async def gmail_oauth_callback(
    payload: GmailCallbackSchema,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    session_state = request.session.get("gmail_oauth_state")
    # 🌟 修复：从 session 中取出 code_verifier
    code_verifier = request.session.get("gmail_code_verifier")

    if session_state and payload.state and session_state != payload.state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
        
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Missing code verifier. Please restart the authorization process.")

    try:
        # 🌟 修复：将 code_verifier 传给 Service
        token_data = await GmailService.exchange_code_for_token(
            code=payload.code, 
            state=payload.state,
            code_verifier=code_verifier
        )
        token_text = GmailService.encode_token(token_data)

        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"gmail_token": token_text}},
        )
        
        # 清理 Session
        request.session.pop("gmail_oauth_state", None)
        request.session.pop("gmail_code_verifier", None)
        
        return {"message": "Gmail connected successfully"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to exchange Gmail token: {exc}")


@gmail_router.get("/list")
async def list_latest_emails(current_user: dict = Depends(get_current_user)):
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    gmail_token_text = (user_doc or {}).get("gmail_token")
    if not gmail_token_text:
        raise HTTPException(status_code=400, detail="Gmail is not connected")

    try:
        token_data = GmailService.decode_token(gmail_token_text)
        emails, refreshed_token = await GmailService.list_latest_emails(token_data=token_data, limit=10)

        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"gmail_token": GmailService.encode_token(refreshed_token)}},
        )
        return {"emails": emails}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to fetch Gmail emails: {exc}")


@gmail_router.get("/message/{message_id}")
async def get_email_detail(message_id: str, current_user: dict = Depends(get_current_user)):
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    gmail_token_text = (user_doc or {}).get("gmail_token")
    if not gmail_token_text:
        raise HTTPException(status_code=400, detail="Gmail is not connected")

    try:
        token_data = GmailService.decode_token(gmail_token_text)
        detail, refreshed_token = await GmailService.get_email_detail(
            token_data=token_data,
            message_id=message_id,
        )

        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"gmail_token": GmailService.encode_token(refreshed_token)}},
        )
        return {"email": detail}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to fetch Gmail email detail: {exc}")