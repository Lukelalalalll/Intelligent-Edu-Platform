# backend/routes/sub1_routes.py
import os
from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
from backend.services.sub1_service import Sub1Service
from backend.config import Config

sub1_bp = Blueprint('sub1', __name__)

@sub1_bp.route('/parse-md', methods=['POST'])
@jwt_required()
def parse_md():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    use_llm = request.form.get('use_llm') == 'true'

    try:
        filename = secure_filename(file.filename)
        upload_dir = os.path.join(Config.UPLOAD_FOLDER, 'sub1')
        os.makedirs(upload_dir, exist_ok=True)

        filepath = os.path.join(upload_dir, filename)
        file.save(filepath)

        result = Sub1Service.parse_md(filepath, use_llm)

        # 3. 返回给前端所需的数据
        return jsonify({
            'status': 'success',
            'filename': filename,
            'headers': result['headers'],
            'tables': result['tables']
        })

    except Exception as e:
        print(f"Error in parse_md: {str(e)}")
        return jsonify({'error': str(e)}), 500


@sub1_bp.route('/combine', methods=['POST'])
@jwt_required()
def combine_sections():
    data = request.json
    filename = data.get('filename')
    selected_indices = data.get('selected_indices', [])
    use_llm = data.get('use_llm', False)

    try:
        filepath = os.path.join(Config.SUB1_UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            filepath = os.path.join(Config.UPLOAD_FOLDER, filename)

        parsed_data = Sub1Service.parse_md(filepath, use_llm=use_llm)
        full_content = parsed_data['full_content']
        all_sections = parsed_data['sections']
        all_headers = parsed_data['headers']

        combined_chunks = []
        sorted_indices = sorted([int(i) for i in selected_indices])

        for idx in sorted_indices:
            target_idx = -1
            for i, h in enumerate(all_headers):
                if int(h['index']) == idx:
                    target_idx = i
                    break

            if target_idx != -1:
                section = all_sections[target_idx]
                header_text = all_headers[target_idx]['text']

                # 1. 初始切片 (注意这里先用 +1 确保能抓到最后一行)
                start_line = section['start']
                end_line = section['end']
                content_slice = full_content[start_line: end_line + 1]

                # 🌟 核心修复逻辑：清理切片边界

                # A. 清理开头：如果第一行是标题行（以#开头），去掉它
                # 因为我们后面会统一手动加上 header_text，不需要正文里自带标题
                if content_slice and content_slice[0].strip().startswith('#'):
                    content_slice = content_slice[1:]

                # B. 清理结尾：如果最后一行是下一个章节的标题（以#开头），去掉它
                # 这是修复“显示下一行标题”的关键！
                if content_slice and content_slice[-1].strip().startswith('#'):
                    content_slice = content_slice[:-1]

                # C. 再次检查结尾：有时最后一行是空的，倒数第二行才是下个标题
                while content_slice and not content_slice[-1].strip():
                    content_slice = content_slice[:-1]
                if content_slice and content_slice[-1].strip().startswith('#'):
                    content_slice = content_slice[:-1]

                # 2. 重新组装：标题 + 纯净的正文
                # 确保标题前面有 # 号
                formatted_header = header_text if header_text.startswith('#') else f"# {header_text}"
                chunk = f"{formatted_header}\n" + '\n'.join(content_slice)
                combined_chunks.append(chunk)

        final_markdown = "\n\n===SECTION_BREAK===\n\n".join(combined_chunks)

        new_filename = f"combined_{os.path.splitext(filename)[0]}.md"
        output_path = os.path.join(Config.SUB1_MD_FOLDER, new_filename)
        os.makedirs(Config.SUB1_MD_FOLDER, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_markdown)

        return jsonify({'status': 'success', 'filename': new_filename})
    except Exception as e:
        print(f"Combine Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@sub1_bp.route('/download/<filename>', methods=['GET'])
@jwt_required()
def download_combined(filename):
    target_folder = Config.SUB1_MD_FOLDER

    print(f"DEBUG: Frontend requesting {filename}. Searching in {target_folder}")

    if not os.path.exists(os.path.join(target_folder, filename)):
        target_folder = Config.MARKDOWN_FOLDER
        if not os.path.exists(os.path.join(target_folder, filename)):
            return jsonify({"error": "File not found"}), 404

    return send_from_directory(target_folder, filename)


@sub1_bp.route('/process-ppt', methods=['POST'])
@jwt_required()
def process_ppt():
    data = request.json
    ppt_schema = data.get('ppt_schema')
    try:
        filename = Sub1Service.create_ppt(ppt_schema)
        return jsonify({'status': 'success', 'download_url': f'/api/sub1/download_ppt/{filename}'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@sub1_bp.route('/download_ppt/<filename>')
@jwt_required()
def download_ppt(filename):
    return send_from_directory(os.path.join(Config.PPT_RESULTS_FOLDER, 'sub1'), filename)