# backend/routes/ai_routes.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from backend.core.security import get_current_user
from backend.schemas import AiChatSchema
from backend.services.ai_gateway_service import AIGatewayService
import asyncio
import json

ai_router = APIRouter(prefix="/api/ai", tags=["AI Chat"])
ai_gateway_service = AIGatewayService()


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
def ai_chat(req: AiChatSchema, user: dict = Depends(get_current_user)):
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

    context = {
        "chat_history": _compact_chat_history(cleaned[:-1]),
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
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")
                await asyncio.sleep(0.01)

            yield b"data: [DONE]\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n".encode("utf-8")

    def generate():
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            agen = generate_async()
            while True:
                try:
                    chunk = loop.run_until_complete(agen.__anext__())
                    yield chunk
                except StopAsyncIteration:
                    break
        finally:
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()

    return StreamingResponse(generate(), media_type="text/event-stream")