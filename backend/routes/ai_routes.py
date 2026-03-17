# backend/routes/ai_routes.py
from flask import Blueprint, request, jsonify, Response, stream_with_context
from backend.config import Config
import requests
import json

ai_bp = Blueprint('ai', __name__)


@ai_bp.route('/upload', methods=['POST'])
def api_ai_upload():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Coze API 的文件上传地址
    upload_url = "https://api.coze.com/v1/files/upload"

    headers = {
        'Authorization': f'Bearer {Config.COZE_TOKEN}'
    }

    try:
        # 封装为 multipart/form-data 格式传给 Coze
        files = {'file': (file.filename, file.stream, file.mimetype)}
        response = requests.post(upload_url, headers=headers, files=files)
        data = response.json()

        # 检查 Coze API 返回的成功标志 (code 0)
        if response.status_code == 200 and data.get('code') == 0:
            return jsonify({
                "file_id": data['data']['id'],
                "file_name": file.filename,
                "mime_type": file.mimetype
            }), 200
        else:
            return jsonify({"error": f"Coze upload failed: {data.get('msg', 'Unknown error')}"}), 400

    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500


# ================= 修改：支持附件的多模态聊天接口 =================
@ai_bp.route('/chat', methods=['POST'])
def api_ai_chat():
    data = request.get_json()
    messages = data.get('messages', [])

    if not messages:
        return jsonify({"error": "No messages"}), 400

    coze_messages = []
    for msg in messages:
        if msg['role'] == 'system':
            continue

        # 提取前端传来的附件
        files = msg.get('files', [])

        if files:
            # 如果带有文件，必须转换成 Coze 的 object_string 格式
            content_list = [{"type": "text", "text": msg.get('content', '')}]

            for f in files:
                file_type = "image" if f.get('mime_type', '').startswith('image/') else "file"
                content_list.append({
                    "type": file_type,
                    "file_id": f['file_id']
                })

            coze_messages.append({
                "role": msg['role'],
                "content": json.dumps(content_list),
                "content_type": "object_string"
            })
        else:
            # 纯文本消息保持原样
            coze_messages.append({
                "role": msg['role'],
                "content": msg['content'],
                "content_type": "text"
            })

    url = Config.COZE_API_BASE
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {Config.COZE_TOKEN}'
    }

    payload = {
        'bot_id': Config.COZE_BOT_ID,
        'user_id': 'hku_user_001',
        'stream': True,
        'additional_messages': coze_messages
    }

    def generate():
        try:
            with requests.post(url, headers=headers, json=payload, stream=True) as response:
                content_type = response.headers.get('Content-Type', '')

                if 'application/json' in content_type:
                    error_json = response.json()
                    api_msg = error_json.get('msg', str(error_json))
                    yield f"data: {json.dumps({'error': f'Coze API Error: {api_msg}'})}\n\n"
                    return

                if response.status_code != 200:
                    yield f"data: {json.dumps({'error': f'HTTP Error {response.status_code}'})}\n\n"
                    return

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

                        if current_event == 'conversation.message.delta':
                            try:
                                data_json = json.loads(data_str)
                                if data_json.get('type') == 'answer':
                                    content = data_json.get('content', '')
                                    if content:
                                        fake_chunk = {"choices": [{"delta": {"content": content}}]}
                                        yield f"data: {json.dumps(fake_chunk)}\n\n"
                            except Exception:
                                pass

                        elif current_event in ['conversation.chat.failed', 'error']:
                            yield f"data: {json.dumps({'error': 'Coze API Generation Failed'})}\n\n"
                            break

        except Exception as e:
            yield f"data: {json.dumps({'error': f'Server Exception: {str(e)}'})}\n\n"

    return Response(stream_with_context(generate()), content_type='text/event-stream')