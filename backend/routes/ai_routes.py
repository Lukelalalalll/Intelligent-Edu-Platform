# backend/routes/ai_routes.py
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from bson import ObjectId
from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import AiChatSchema, StudyCozeSchema
from backend.services.ai_gateway_service import AIGatewayService
from backend.config import Config
import asyncio
import httpx
import json
import logging

logger = logging.getLogger(__name__)

ai_router = APIRouter(prefix="/api/ai", tags=["AI Chat"])
ai_gateway_service = AIGatewayService()

# Shared error messages
_DEFAULT_TITLE = "New Conversation"
_ERR_INVALID_ID = "Invalid session id"
_ERR_NOT_FOUND = "Session not found"
_ERR_FORBIDDEN = "Not your session"

# ---------------------------------------------------------------------------
# Session CRUD – all scoped to current user
# ---------------------------------------------------------------------------

@ai_router.get("/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    """Return all sessions for the current user (title + meta only, no messages)."""
    cursor = db.ai_chat_sessions.find(
        {"userId": ObjectId(user["id"])},
        {"messages": 0},
    ).sort("updatedAt", -1)
    sessions = []
    async for doc in cursor:
        sessions.append({
            "id": str(doc["_id"]),
            "clientId": doc.get("clientId", ""),
            "title": doc.get("title", _DEFAULT_TITLE),
            "createdAt": doc.get("createdAt", ""),
            "updatedAt": doc.get("updatedAt", ""),
        })
    return {"sessions": sessions}


@ai_router.post("/sessions")
async def create_session(user: dict = Depends(get_current_user)):
    """Create a new empty session and return its server-side _id."""
    now = datetime.now(timezone.utc)
    doc = {
        "userId": ObjectId(user["id"]),
        "clientId": "",
        "title": _DEFAULT_TITLE,
        "messages": [{"role": "system", "content": "You are a helpful academic AI assistant for HKU.", "createdAt": now}],
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.ai_chat_sessions.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "title": doc["title"],
        "messages": [{"role": "system", "content": doc["messages"][0]["content"]}],
        "createdAt": now,
        "updatedAt": now,
    }


@ai_router.put("/sessions/{session_id}")
async def update_session(session_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Sync a session's title + messages. Only the owning user may update."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail=_ERR_INVALID_ID)

    existing = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not existing:
        raise HTTPException(status_code=404, detail=_ERR_NOT_FOUND)
    if str(existing["userId"]) != user["id"]:
        raise HTTPException(status_code=403, detail=_ERR_FORBIDDEN)

    now = datetime.now(timezone.utc)
    update_fields = {"updatedAt": now}
    if "title" in body:
        update_fields["title"] = str(body["title"])[:200]
    if "messages" in body and isinstance(body["messages"], list):
        update_fields["messages"] = body["messages"]

    await db.ai_chat_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": update_fields},
    )
    return {"ok": True}


@ai_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a session. Only the owning user may delete."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail=_ERR_INVALID_ID)

    existing = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not existing:
        raise HTTPException(status_code=404, detail=_ERR_NOT_FOUND)
    if str(existing["userId"]) != user["id"]:
        raise HTTPException(status_code=403, detail=_ERR_FORBIDDEN)

    await db.ai_chat_sessions.delete_one({"_id": ObjectId(session_id)})
    return {"ok": True}


@ai_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    """Return a single session with full messages."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail=_ERR_INVALID_ID)

    doc = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=_ERR_NOT_FOUND)
    if str(doc["userId"]) != user["id"]:
        raise HTTPException(status_code=403, detail=_ERR_FORBIDDEN)

    # Strip createdAt from each message for frontend compat, and ObjectId fields
    messages = []
    for m in doc.get("messages", []):
        messages.append({
            "role": m.get("role", ""),
            "content": m.get("content", ""),
        })

    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", _DEFAULT_TITLE),
        "messages": messages,
        "createdAt": doc.get("createdAt", ""),
        "updatedAt": doc.get("updatedAt", ""),
    }


def _compact_chat_history(messages: list[dict], keep_pairs: int = 6) -> list[dict]:
    cleaned: list[dict] = []
    for item in messages:
        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            cleaned.append({"role": role, "content": content})
    return cleaned[-(keep_pairs * 2):]


def _chunk_text(text: str, size: int = 1) -> list[str]:
    content = str(text or "")
    if not content:
        return []
    return [content[i:i + size] for i in range(0, len(content), size)]

@ai_router.post("/chat")
async def ai_chat(req: AiChatSchema, user: dict = Depends(get_current_user)):
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages")

    cleaned = [m for m in req.messages if isinstance(m, dict)]
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid messages")

    user_messages = [m for m in cleaned if str(m.get("role", "")).lower() == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message")

    latest_user_message = str(user_messages[-1].get("content", "")).strip()
    if not latest_user_message:
        raise HTTPException(status_code=400, detail="Latest user message is empty")

    # Load user's AI memory to inject as context
    user_doc = await db.users.find_one({"_id": user["_id"]})
    ai_memory = (user_doc or {}).get("ai_memory", {})
    memory_text = ""
    if ai_memory:
        parts = []
        if ai_memory.get("name"):
            parts.append(f"Name: {ai_memory['name']}")
        if ai_memory.get("major"):
            parts.append(f"Major: {ai_memory['major']}")
        if ai_memory.get("year"):
            parts.append(f"Year: {ai_memory['year']}")
        if ai_memory.get("preferences"):
            parts.append(f"Preferences: {ai_memory['preferences']}")
        if parts:
            memory_text = "Student profile — " + "; ".join(parts) + ". Adapt your responses to this student's background."

    context = {
        "chat_history": _compact_chat_history(cleaned[:-1]),
        "system_memory": memory_text,
        "coze_user_id": f"chat_{str(user.get('_id', user.get('id', 'anon')))}",
    }

    async def generate_async():
        try:
            reply = await ai_gateway_service.chat(message=latest_user_message, context=context)
            chunks = _chunk_text(reply, size=1)
            if not chunks:
                chunks = ["No response content."]

            for part in chunks:
                data = {
                    "choices": [
                        {
                            "delta": {
                                "content": part,
                            }
                        }
                    ]
                }
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            yield "data: [DONE]\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate_async(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI Memory — per-user profile context for personalized responses
# ---------------------------------------------------------------------------

@ai_router.get("/memory")
async def get_ai_memory(user: dict = Depends(get_current_user)):
    """Return the user's AI memory profile."""
    user_doc = await db.users.find_one({"_id": user["_id"]})
    memory = (user_doc or {}).get("ai_memory", {})
    return {"memory": memory}


@ai_router.put("/memory")
async def update_ai_memory(body: dict, user: dict = Depends(get_current_user)):
    """Update the user's AI memory profile. Accepts { name, major, year, preferences }."""
    allowed_keys = {"name", "major", "year", "preferences"}
    sanitized = {}
    for k in allowed_keys:
        val = str(body.get(k, "") or "").strip()[:200]
        sanitized[k] = val
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"ai_memory": sanitized}},
    )
    return {"memory": sanitized}


# ---------------------------------------------------------------------------
# Coze-backed Study Coach (non-streaming, returns full text for typewriter)
# ---------------------------------------------------------------------------

_STUDY_COZE_SYSTEM = (
    "You are an intelligent academic study coach helping a student understand study material.\n\n"
    "Rules:\n"
    "1. NEVER give direct answers to questions or problems — only provide hints, "
    "guiding questions, or partial explanations to encourage critical thinking.\n"
    "2. If the student asks 'what is the answer?', respond with: "
    "'I can\\'t give you the direct answer, but here\\'s a hint: ...'\n"
    "3. For concepts: explain clearly with analogies.\n"
    "4. For exercises/problems: only give the first step or a key hint.\n"
    "5. Be encouraging, concise, and Socratic.\n"
    "6. If you detect the content is a mathematical or coding problem, "
    "never output the full solution.\n"
    "7. Respond in the same language as the student's message."
)


async def _call_coze_study(system_prompt: str, user_content: str, context: str = "", user_id: str = "study_coach", history_messages: list = None) -> str:
    """Call Coze v3 chat API for study coach (text-only, polling)."""
    api_key = Config.COZE_TOKEN
    bot_id = Config.COZE_BOT_ID
    api_root = (Config.COZE_API_ROOT or "https://api.coze.com").rstrip("/")

    if not api_key or not bot_id:
        raise HTTPException(503, "Coze API key or bot id not configured")

    additional_msgs = []

    # 1. Document context as a standalone user message (only when provided)
    if context:
        additional_msgs.append(
            {"role": "user", "content": f"Here is the document I am studying:\n{context[:8000]}", "content_type": "text"}
        )

    # 2. Conversation history
    if history_messages:
        for m in history_messages[-10:]:
            role = m.get("role", "user")
            if role not in ("user", "assistant"):
                continue
            additional_msgs.append({"role": role, "content": m.get("content", ""), "content_type": "text"})

    # 3. Current user question with concise system instructions
    additional_msgs.append({"role": "user", "content": f"{system_prompt}\n\nStudent: {user_content}", "content_type": "text"})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "bot_id": bot_id,
        "user_id": user_id,
        "stream": False,
        "additional_messages": additional_msgs,
    }

    timeout_seconds = float(getattr(Config, "COZE_REQUEST_TIMEOUT_SECONDS", 120))
    poll_interval = float(getattr(Config, "COZE_POLL_INTERVAL_SECONDS", 2))
    poll_max = int(getattr(Config, "COZE_POLL_MAX_ATTEMPTS", 30))

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        start_resp = await client.post(f"{api_root}/v3/chat", headers=headers, json=payload)
        if start_resp.status_code != 200:
            logger.error("Coze study start error %s: %s", start_resp.status_code, start_resp.text[:500])
            raise HTTPException(502, f"AI service error: {start_resp.status_code}")

        start_data = start_resp.json().get("data", {})
        chat_id = start_data.get("id")
        conversation_id = start_data.get("conversation_id")
        if not chat_id or not conversation_id:
            raise HTTPException(502, "AI service returned invalid chat identifiers")

        for _ in range(poll_max):
            retrieve_resp = await client.get(
                f"{api_root}/v3/chat/retrieve",
                headers=headers,
                params={"chat_id": chat_id, "conversation_id": conversation_id},
            )
            if retrieve_resp.status_code != 200:
                raise HTTPException(502, f"AI service error: {retrieve_resp.status_code}")

            status = retrieve_resp.json().get("data", {}).get("status")
            if status == "completed":
                msg_resp = await client.get(
                    f"{api_root}/v3/chat/message/list",
                    headers=headers,
                    params={"chat_id": chat_id, "conversation_id": conversation_id},
                )
                if msg_resp.status_code != 200:
                    raise HTTPException(502, f"AI service error: {msg_resp.status_code}")
                for msg in msg_resp.json().get("data", []):
                    if msg.get("type") in {"answer", "assistant_answer"} and msg.get("content"):
                        return str(msg["content"])
                # Fallback: first assistant message with type != "verbose" (skip internal tool calls)
                for msg in msg_resp.json().get("data", []):
                    if msg.get("role") == "assistant" and msg.get("type") not in {"verbose", "function_call", "tool_output", "tool_response"} and msg.get("content"):
                        return str(msg["content"])
                raise HTTPException(502, "AI completed but returned no answer")
            if status in {"failed", "canceled", "requires_action"}:
                err_info = retrieve_resp.json().get("data", {})
                last_err = err_info.get("last_error", {}) or {}
                logger.error("Coze chat %s: status=%s last_error=%s", chat_id, status, last_err)
                raise HTTPException(502, f"AI ended with status: {status}")
            await asyncio.sleep(poll_interval)

    raise HTTPException(504, "AI service timeout")


@ai_router.post("/study-coze")
async def study_coze(req: StudyCozeSchema, user: dict = Depends(get_current_user)):
    """Non-streaming Coze study coach. Returns { reply: str }."""
    content = req.content.strip()
    mode = req.mode
    context = (req.context or "").strip()
    history = [m.model_dump() for m in (req.messages or [])]

    if not content:
        raise HTTPException(400, "No content provided")

    mode_suffix = ""
    if mode == "hint":
        mode_suffix = (
            "\n\nThe student selected this text as something they want to understand "
            "— provide a Socratic hint, not an explanation."
        )
    elif mode == "explain":
        mode_suffix = "\n\nExplain this concept in simple terms with an analogy."

    system = _STUDY_COZE_SYSTEM + mode_suffix

    # Use per-user id so Coze doesn't mix conversations across students
    coze_user_id = f"study_{str(user.get('_id', 'anon'))}"

    try:
        reply = await asyncio.wait_for(
            _call_coze_study(system, content, context=context, user_id=coze_user_id, history_messages=history),
            timeout=60,
        )
        return JSONResponse({"reply": reply})
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI study coach timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("study-coze error")
        raise HTTPException(500, str(e))