from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_jwt_extended import jwt_required
from backend.config import Config
import requests
import json

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/chat', methods=['POST'])
@jwt_required()
def api_ai_chat():
    messages = request.get_json().get('messages', [])
    if not messages: return jsonify({"error": "No messages provided"}), 400

    url = 'https://api.deepseek.com/chat/completions'
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {Config.DEEPSEEK_API_KEY}'}
    payload = {'model': 'deepseek-chat', 'messages': messages, 'temperature': 0.7, 'stream': True}

    def generate():
        try:
            with requests.post(url, headers=headers, json=payload, stream=True) as response:
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk: yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n".encode('utf-8')

    return Response(stream_with_context(generate()), content_type='text/event-stream')