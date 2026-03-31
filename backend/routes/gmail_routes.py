# backend/routes/gmail_routes.py
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.core.database import db
from backend.core.security import get_current_user
from backend.services.gmail_service import GmailService

logger = logging.getLogger(__name__)

gmail_router = APIRouter(prefix="/api/gmail", tags=["Gmail"])

_GMAIL_NOT_CONNECTED = "Gmail is not connected"


class GmailCallbackSchema(BaseModel):
    code: str
    state: str | None = None


class GmailSendSchema(BaseModel):
    to: str
    subject: str
    body: str


class GmailReplySchema(BaseModel):
    threadId: str
    messageId: str
    to: str
    subject: str
    body: str
    inReplyTo: str | None = None


class GmailDraftSchema(BaseModel):
    to: str
    subject: str
    body: str
    threadId: str | None = None


class GmailClassifySchema(BaseModel):
    messageId: str
    subject: str | None = None
    body: str | None = None
    sender: str | None = None


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

    # Strict state comparison — both must exist and match
    if not session_state or not payload.state or session_state != payload.state:
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
async def list_latest_emails(current_user: dict = Depends(get_current_user), page_token: str | None = None):
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    gmail_token_text = (user_doc or {}).get("gmail_token")
    if not gmail_token_text:
        raise HTTPException(status_code=400, detail=_GMAIL_NOT_CONNECTED)

    try:
        token_data = GmailService.decode_token(gmail_token_text)
        emails, refreshed_token, next_page_token = await GmailService.list_latest_emails(
            token_data=token_data, limit=10, page_token=page_token,
        )

        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"gmail_token": GmailService.encode_token(refreshed_token)}},
        )
        return {"emails": emails, "nextPageToken": next_page_token}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to fetch Gmail emails: {exc}")


@gmail_router.get("/message/{message_id}")
async def get_email_detail(message_id: str, current_user: dict = Depends(get_current_user)):
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    gmail_token_text = (user_doc or {}).get("gmail_token")
    if not gmail_token_text:
        raise HTTPException(status_code=400, detail=_GMAIL_NOT_CONNECTED)

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


# ─── Helper: extract token from user doc ──────────────────────────────

async def _get_gmail_token(current_user: dict) -> dict:
    """Return token_data. Raises 400 if not connected."""
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    gmail_token_text = (user_doc or {}).get("gmail_token")
    if not gmail_token_text:
        raise HTTPException(status_code=400, detail=_GMAIL_NOT_CONNECTED)
    return GmailService.decode_token(gmail_token_text)


async def _save_refreshed_token(user_id, refreshed_token: dict) -> None:
    await db.users.update_one(
        {"_id": user_id},
        {"$set": {"gmail_token": GmailService.encode_token(refreshed_token)}},
    )


# ─── Send Email ────────────────────────────────────────────────────────

@gmail_router.post("/send")
async def send_email(payload: GmailSendSchema, current_user: dict = Depends(get_current_user)):
    token_data = await _get_gmail_token(current_user)
    try:
        result, refreshed_token = await GmailService.send_email(
            token_data=token_data,
            to=payload.to,
            subject=payload.subject,
            body=payload.body,
        )
        await _save_refreshed_token(current_user["_id"], refreshed_token)
        return {"message": "Email sent", "result": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")


# ─── Reply to Email ───────────────────────────────────────────────────

@gmail_router.post("/reply")
async def reply_to_email(payload: GmailReplySchema, current_user: dict = Depends(get_current_user)):
    token_data = await _get_gmail_token(current_user)
    try:
        result, refreshed_token = await GmailService.reply_to_email(
            token_data=token_data,
            thread_id=payload.threadId,
            message_id=payload.messageId,
            to=payload.to,
            subject=payload.subject,
            body=payload.body,
            in_reply_to=payload.inReplyTo,
        )
        await _save_refreshed_token(current_user["_id"], refreshed_token)
        return {"message": "Reply sent", "result": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to reply to email: {exc}")


# ─── Get Thread ────────────────────────────────────────────────────────

@gmail_router.get("/thread/{thread_id}")
async def get_thread(thread_id: str, current_user: dict = Depends(get_current_user)):
    token_data = await _get_gmail_token(current_user)
    try:
        thread, refreshed_token = await GmailService.get_thread(
            token_data=token_data,
            thread_id=thread_id,
        )
        await _save_refreshed_token(current_user["_id"], refreshed_token)
        return {"thread": thread}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to fetch thread: {exc}")


# ─── Create Draft ──────────────────────────────────────────────────────

@gmail_router.post("/draft")
async def create_draft(payload: GmailDraftSchema, current_user: dict = Depends(get_current_user)):
    token_data = await _get_gmail_token(current_user)
    try:
        result, refreshed_token = await GmailService.create_draft(
            token_data=token_data,
            to=payload.to,
            subject=payload.subject,
            body=payload.body,
            thread_id=payload.threadId,
        )
        await _save_refreshed_token(current_user["_id"], refreshed_token)
        return {"message": "Draft created", "result": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to create draft: {exc}")


# ─── Disconnect Gmail ─────────────────────────────────────────────────

@gmail_router.post("/disconnect")
async def disconnect_gmail(current_user: dict = Depends(get_current_user)):
    """Remove stored Gmail token for the current user."""
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$unset": {"gmail_token": ""}},
    )
    return {"message": "Gmail disconnected successfully"}


# ─── AI: Classify Email ───────────────────────────────────────────────

@gmail_router.post("/classify")
async def classify_email(payload: GmailClassifySchema, current_user: dict = Depends(get_current_user)):
    """Use AI to classify an email (category, urgency, summary, entities).
    Results are cached in MongoDB email_classifications collection."""
    from backend.prompts import prompt_registry
    from backend.core.dependencies import get_ai_gateway_service

    token_data = await _get_gmail_token(current_user)

    try:
        # Check cache first
        cached = await db.email_classifications.find_one({"messageId": payload.messageId})
        if cached:
            cached.pop("_id", None)
            return {"classification": cached.get("classification", {}), "cached": True}

        # Use provided content or fetch from Gmail
        if payload.subject and payload.body:
            detail = {"from": payload.sender or "", "subject": payload.subject, "bodyText": payload.body, "snippet": ""}
        else:
            detail, refreshed_token = await GmailService.get_email_detail(
                token_data=token_data,
                message_id=payload.messageId,
            )
            await _save_refreshed_token(current_user["_id"], refreshed_token)

        # Build classification prompt
        prompt = prompt_registry.render(
            "email", "classify_email",
            sender=detail.get("from", ""),
            subject=detail.get("subject", ""),
            body=(detail.get("bodyText", "") or detail.get("snippet", ""))[:3000],
        )

        # Call AI
        ai_service = get_ai_gateway_service()
        response = await ai_service.chat(prompt)

        # Try to parse as JSON
        try:
            classification = json.loads(response)
        except json.JSONDecodeError:
            classification = {"raw_response": response}

        # Cache in MongoDB
        from datetime import datetime, timezone
        await db.email_classifications.update_one(
            {"messageId": payload.messageId},
            {"$set": {
                "messageId": payload.messageId,
                "classification": classification,
                "cachedAt": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

        return {"classification": classification, "cached": False}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to classify email: {exc}")


class GmailSuggestReplySchema(BaseModel):
    subject: str | None = None
    body: str | None = None
    sender: str | None = None


# ─── AI: Suggest Reply ────────────────────────────────────────────────

@gmail_router.post("/suggest_reply/{message_id}")
async def suggest_reply(message_id: str, payload: GmailSuggestReplySchema | None = None, current_user: dict = Depends(get_current_user)):
    """Use AI to generate a suggested reply for an email."""
    from backend.prompts import prompt_registry
    from backend.core.dependencies import get_ai_gateway_service

    token_data = await _get_gmail_token(current_user)

    try:
        # Use provided content or fetch from Gmail
        if payload and payload.subject and payload.body:
            detail = {"from": payload.sender or "", "subject": payload.subject, "bodyText": payload.body, "snippet": ""}
        else:
            detail, refreshed_token = await GmailService.get_email_detail(
                token_data=token_data,
                message_id=message_id,
            )
            await _save_refreshed_token(current_user["_id"], refreshed_token)

        # Build context about the teacher
        teacher_context = f"Teacher: {current_user.get('username', '')}, Email: {current_user.get('email', '')}"

        prompt = prompt_registry.render(
            "email", "suggest_reply",
            sender=detail.get("from", ""),
            subject=detail.get("subject", ""),
            body=(detail.get("bodyText", "") or detail.get("snippet", ""))[:3000],
            teacher_context=teacher_context,
        )

        ai_service = get_ai_gateway_service()
        reply_suggestion = await ai_service.chat(prompt)

        return {
            "suggestion": reply_suggestion,
            "email": detail,
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to generate reply suggestion: {exc}")