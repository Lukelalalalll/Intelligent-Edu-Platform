import React, { useState, useEffect } from 'react';
import client from '../api/client';
import AdminDashboard from '../pages/AdminDashboard';

export default function AdminDashboardEntry() {
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [modalState, setModalState] = useState({ isOpen: false, isEditMode: false });
    const [formData, setFormData] = useState({ id: '', username: '', email: '', password: '', role: 'teacher' });
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // 从 localStorage 获取当前管理员的 ID，防止他删掉自己
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentUserId = currentUser.id;

    // 1. 获取所有用户列表
    const fetchUsers = async () => {
        try {
            // 使用封装好的 client，它会自动带上 JWT Cookie，不需要写 header
            const response = await client.get('/admin/users');
            setUsers(response.data);
        } catch (error) {
            console.error("Failed to fetch users:", error);
            // 如果后端返回 403 没权限，可以考虑跳转回首页
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // 2. 模态框操作
    const openAddModal = () => {
        setFormData({ id: '', username: '', email: '', password: '', role: 'teacher' });
        setModalState({ isOpen: true, isEditMode: false });
    };

    const openEditModal = (user) => {
        setFormData({
            id: user.id,
            username: user.username,
            email: user.email,
            password: '',
            role: user.role || 'student'
        });
        setModalState({ isOpen: true, isEditMode: true });
    };

    const closeModal = () => {
        setModalState({ isOpen: false, isEditMode: false });
    };

    // 3. 表单提交 (新增 / 更新)
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        const { id, username, email, role, password } = formData;
        const payload = { username, email, role, password };

        try {
            if (modalState.isEditMode) {
                await client.put(`/admin/update_user/${id}`, payload);
            } else {
                await client.post(`/admin/add_user`, payload);
            }
            closeModal();
            fetchUsers(); // 提交成功后重新拉取列表
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || 'Operation failed'));
        } finally {
            setIsSaving(false);
        }
    };

    // 4. 删除用户
    const deleteUser = async (userId, username) => {
        if (!window.confirm(`Are you sure you want to delete "${username}"?\nThis action cannot be undone.`)) return;

        setDeletingId(userId);
        try {
            await client.delete(`/admin/delete_user/${userId}`);
            setUsers(prev => prev.filter(u => u.id !== userId)); // 本地直接移除，不用重新拉取
        } catch (err) {
            alert('Failed to delete user: ' + (err.response?.data?.message || 'Network error'));
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <AdminDashboard
            users={users}
            currentUserId={currentUserId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            modalState={modalState}
            formData={formData}
            setFormData={setFormData}
            isSaving={isSaving}
            deletingId={deletingId}
            openAddModal={openAddModal}
            openEditModal={openEditModal}
            closeModal={closeModal}
            handleFormSubmit={handleFormSubmit}
            deleteUser={deleteUser}
        />
    );
}