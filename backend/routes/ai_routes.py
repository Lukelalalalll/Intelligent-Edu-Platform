# backend/routes/ai_routes.py
from flask import Blueprint, request, jsonify, Response, stream_with_context
from backend.config import Config
import requests
import json

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/chat', methods=['POST'])
# 暂时注释掉鉴权，方便测试
# @jwt_required()
def api_ai_chat():
    data = request.get_json()
    messages = data.get('messages', [])
    if not messages:
        return jsonify({"error": "No messages"}), 400

    print(f"\n[Backend Log] 收到前端请求，消息数量: {len(messages)}")

    # 1. 构造 Coze V3 要求的 messages 格式
    coze_messages = []
    for msg in messages:
        # Coze 的附加消息通常不需要 system 角色 (system人设在网页端配置)
        if msg['role'] == 'system':
            continue
        coze_messages.append({
            "role": msg['role'],
            "content": msg['content'],
            "content_type": "text"
        })

    # 2. Coze API 请求参数
    url = Config.COZE_API_BASE
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {Config.COZE_TOKEN}'
    }
    payload = {
        'bot_id': Config.COZE_BOT_ID,
        'user_id': 'hku_user_001',  # Coze V3 必填字段，标识具体用户，可暂时写死
        'stream': True,
        'additional_messages': coze_messages
    }

    def generate():
        try:
            with requests.post(url, headers=headers, json=payload, stream=True) as response:
                print(f"[Backend Log] Coze 返回状态码: {response.status_code}")

                if response.status_code != 200:
                    error_msg = response.text
                    print(f"[Backend Log] Coze 报错: {error_msg}")
                    yield f"data: {json.dumps({'error': f'Coze API Error ({response.status_code})'})}\n\n"
                    return

                # 解析 Coze 的 SSE 数据流 (event / data)
                current_event = None
                for line in response.iter_lines():
                    if not line:
                        continue

                    line = line.decode('utf-8')

                    if line.startswith('event:'):
                        current_event = line.replace('event:', '').strip()

                    elif line.startswith('data:'):
                        data_str = line.replace('data:', '').strip()

                        if data_str == '[DONE]':
                            yield "data: [DONE]\n\n"
                            break

                        # Coze 的增量文本在 conversation.message.delta 事件里
                        if current_event == 'conversation.message.delta':
                            try:
                                data_json = json.loads(data_str)
                                # 确保只提取机器人的回答 (type == 'answer')
                                if data_json.get('type') == 'answer':
                                    content = data_json.get('content', '')
                                    if content:
                                        # 【关键适配】将 Coze 的数据伪装成 DeepSeek/OpenAI 格式返回给前端！
                                        fake_deepseek_chunk = {
                                            "choices": [{"delta": {"content": content}}]
                                        }
                                        yield f"data: {json.dumps(fake_deepseek_chunk)}\n\n"
                            except Exception as e:
                                print(f"[Backend Log] 解析 JSON 失败: {e}")

                        # 如果生成失败
                        elif current_event == 'conversation.chat.failed':
                            yield f"data: {json.dumps({'error': 'Coze Bot generation failed.'})}\n\n"
                            break

        except Exception as e:
            print(f"[Backend Log] 服务器内部错误: {str(e)}")
            yield f"data: {json.dumps({'error': f'Server Error: {str(e)}'})}\n\n"

    return Response(stream_with_context(generate()), content_type='text/event-stream')