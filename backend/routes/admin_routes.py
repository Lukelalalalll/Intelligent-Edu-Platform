from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.models import User
from backend.extensions import db

admin_bp = Blueprint('admin', __name__)


def check_admin():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_admin:
        return False, jsonify({"message": "Permission denied"}), 403
    return True, user


@admin_bp.route('/users', methods=['GET'])
@jwt_required()
def api_get_users():
    is_admin, err = check_admin()
    if not is_admin: return err
    return jsonify([{"id": u.id, "username": u.username, "email": u.email, "role": u.role} for u in User.query.all()])


@admin_bp.route('/add_user', methods=['POST'])
@jwt_required()
def api_add_user():
    is_admin, err = check_admin()
    if not is_admin: return err

    data = request.get_json()
    if User.query.filter_by(username=data.get('username')).first(): return jsonify(
        {'message': 'Username already taken'}), 400

    try:
        new_user = User(username=data['username'], email=data['email'], role=data.get('role', 'student'))
        new_user.set_password(data.get('password', '123456'))
        db.session.add(new_user)
        db.session.commit()
        return jsonify({'message': 'User created successfully', 'id': new_user.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 500


@admin_bp.route('/update_user/<int:user_id>', methods=['PUT'])
@jwt_required()
def api_update_user(user_id):
    is_admin, admin_user = check_admin()
    if not is_admin: return admin_user  # 这里 admin_user 是错误响应

    user = db.session.get(User, user_id)
    if not user: return jsonify({'message': 'User not found'}), 404

    data = request.get_json()
    try:
        if 'username' in data: user.username = data['username']
        if 'email' in data: user.email = data['email']
        if 'role' in data:
            if user.id == admin_user.id and data['role'] != 'admin':
                return jsonify({'message': 'Cannot remove your own admin status'}), 400
            if data['role'] in ['admin', 'teacher', 'student']: user.role = data['role']
        if data.get('password'): user.set_password(data['password'])
        db.session.commit()
        return jsonify({'message': 'User updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 500


@admin_bp.route('/delete_user/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    is_admin, admin_user = check_admin()
    if not is_admin: return admin_user

    user_to_delete = db.session.get(User, user_id)
    if not user_to_delete: return jsonify({'message': 'User not found'}), 404
    if user_to_delete.id == admin_user.id: return jsonify({'message': 'Cannot delete yourself'}), 400

    db.session.delete(user_to_delete)
    db.session.commit()
    return jsonify({'message': 'User deleted successfully'}), 200