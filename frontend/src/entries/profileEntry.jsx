import React, { useState } from 'react';
import client from '../api/client';
import Profile from '../pages/Profile';

export default function ProfileEntry() {
    const storedUser = JSON.parse(localStorage.getItem('user'));

    const [formData, setFormData] = useState({
        username: storedUser?.username || '',
        email: storedUser?.email || '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [alert, setAlert] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const getRoleInfo = (role) => {
        switch(role) {
            case 'admin': return { icon: 'fa-shield-alt', text: 'Administrator' };
            case 'teacher': return { icon: 'fa-chalkboard-teacher', text: 'Teacher' };
            default: return { icon: 'fa-user-graduate', text: 'Student' };
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        setShowModal(true);
    };

    const handleSaveProfile = async () => {
        setShowModal(false);
        setIsLoading(true);
        try {
            const response = await client.post('/profile/update', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password.trim()
            });

            // 更新本地存储的数据，确保 Navbar 同步更新
            const newUser = { ...storedUser, username: formData.username, email: formData.email };
            localStorage.setItem('user', JSON.stringify(newUser));

            setAlert({ type: 'success', message: 'Profile updated successfully!' });
            setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
            setAlert({ type: 'error', message: error.response?.data?.message || 'Update failed' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Profile
            user={storedUser}
            formData={formData}
            handleInputChange={handleInputChange}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            alert={alert}
            showModal={showModal}
            setShowModal={setShowModal}
            isLoading={isLoading}
            handleFormSubmit={handleFormSubmit}
            handleSaveProfile={handleSaveProfile}
            roleInfo={getRoleInfo(storedUser?.role)}
            handleModalBackgroundClick={(e) => e.target.classList.contains('modal-overlay') && setShowModal(false)}
        />
    );
}