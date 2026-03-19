# backend/routes/ai_routes.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from backend.core.security import get_current_user
from backend.schemas import AiChatSchema
from backend.config import Config
import requests
import json

ai_router = APIRouter(prefix="/api/ai", tags=["AI Chat"])

@ai_router.post("/chat")
def ai_chat(req: AiChatSchema, user: dict = Depends(get_current_user)):
    if not req.messages: raise HTTPException(status_code=400, detail="No messages")

    url = 'https://api.deepseek.com/chat/completions'
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {Config.DEEPSEEK_API_KEY}'}
    payload = {'model': 'deepseek-chat', 'messages': req.messages, 'temperature': 0.7, 'stream': True}

    def generate():
        try:
            with requests.post(url, headers=headers, json=payload, stream=True) as response:
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk: yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n".encode('utf-8')

    return StreamingResponse(generate(), media_type="text/event-stream")