import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Register from '../pages/Register';

export default function RegisterEntry() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', password: '', confirm_password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ message: '', type: '', visible: false, leaving: false });

    const showToast = (message, type = 'error') => {
        setToast({ message, type, visible: true, leaving: false });
        setTimeout(() => {
            setToast(prev => ({ ...prev, leaving: true }));
            setTimeout(() => setToast({ message: '', type: '', visible: false, leaving: false }), 300);
        }, 3000);
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirm_password) {
            showToast('Passwords do not match!', 'error');
            return;
        }

        setLoading(true);
        try {
            await client.post('/register', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password
            });
            showToast('Account created successfully!', 'success');
            setTimeout(() => navigate('/login'), 1500);
        } catch (error) {
            showToast(error.response?.data?.message || 'Registration failed', 'error');
            setLoading(false);
        }
    };

    return <Register {...{ formData, handleChange, showPassword, setShowPassword, showConfirmPassword, setShowConfirmPassword, loading, handleSubmit, toast }} />;
}