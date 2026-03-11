from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required
from backend.services.sub1_service import Sub1Service
from backend.config import Config
import os

sub1_bp = Blueprint('sub1', __name__)

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

@sub1_bp.route('/parse-md', methods=['POST'])
@jwt_required()
def parse_md():
    # 这里处理文件上传和解析
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    # 保存文件到 Config.SUB1_UPLOAD_FOLDER ...
    # 调用 Sub1Service.parse_md(filepath, use_llm=False)
    # 返回 json
    pass