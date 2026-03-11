from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import create_access_token, set_access_cookies, unset_jwt_cookies, jwt_required, \
    get_jwt_identity
from backend.models import User
from backend.extensions import db

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def api_register():
    data = request.get_json()
    username, email, password = data.get('username'), data.get('email'), data.get('password')

    if not username or not email or not password:
        return jsonify({'message': 'Missing fields'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'message': 'Username already exists'}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'Email already exists'}), 409

    new_user = User(username=username, email=email)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'message': 'Account created successfully'}), 201


@auth_bp.route('/login', methods=['POST'])
def api_login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()

    if not user or not user.check_password(data.get('password')):
        return jsonify({'message': 'Account not exist or wrong password'}), 401

    access_token = create_access_token(identity=str(user.id))
    resp = jsonify({
        'message': 'Login successful',
        'user': {'id': user.id, 'username': user.username, 'role': user.role, 'is_admin': user.is_admin}
    })
    set_access_cookies(resp, access_token)
    return resp, 200


@auth_bp.route('/logout', methods=['POST'])
def api_logout():
    resp = jsonify({'message': 'Logout successful'})
    unset_jwt_cookies(resp)
    return resp, 200


@auth_bp.route('/reset-password', methods=['POST'])
def api_reset_password():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username'), email=data.get('email')).first()
    if not user:
        return jsonify({'message': 'Username and Email do not match our records.'}), 404

    user.set_password(data.get('new_password'))
    db.session.commit()
    return jsonify({'message': 'Password reset successfully'}), 200


@auth_bp.route('/profile/update', methods=['POST'])
@jwt_required()
def update_profile():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user: return jsonify({'message': 'User not found'}), 404

    data = request.get_json()
    new_username, new_email, new_password = data.get('username'), data.get('email'), data.get('password')

    try:
        if new_username and new_username != user.username:
            if User.query.filter_by(username=new_username).first(): return jsonify(
                {'message': 'Username already exists'}), 409
            user.username = new_username
        if new_email and new_email != user.email:
            if User.query.filter_by(email=new_email).first(): return jsonify({'message': 'Email already exists'}), 409
            user.email = new_email
        if new_password and new_password.strip() != "":
            user.set_password(new_password)

        db.session.commit()
        return jsonify({'message': 'Profile updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 500