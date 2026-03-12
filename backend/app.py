import os
from flask import Flask, jsonify
from backend.config import Config
from backend.extensions import db, jwt, cors, mongo
from backend.routes.auth_routes import auth_bp
from backend.routes.admin_routes import admin_bp
from backend.routes.ai_routes import ai_bp
from backend.routes.sub1_routes import sub1_bp
def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    mongo.init_app(app)
    cors.init_app(app, supports_credentials=True, origins=["http://localhost:5173"])

    @jwt.unauthorized_loader
    def custom_unauthorized_response(_err):
        return jsonify({"message": "Please log in first"}), 401

    @jwt.expired_token_loader
    def custom_expired_token_response(jwt_header, jwt_payload):
        return jsonify({"message": "Token expired"}), 401

    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')

    with app.app_context():
        for folder in app.config['ALL_FOLDERS']:
            os.makedirs(folder, exist_ok=True)

    return app

if __name__ == '__main__':
    app = create_app()
    is_debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', debug=is_debug, port=5009)