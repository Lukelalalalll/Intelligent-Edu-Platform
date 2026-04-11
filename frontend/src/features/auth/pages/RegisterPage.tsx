import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../../api/client';
import Register from '../Register';

export default function RegisterPage() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', password: '', confirm_password: '', staffCode: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isStaff, setIsStaff] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ message: '', type: '', visible: false, leaving: false });

    const showToast = (message, type = 'error') => {
        setToast({ message, type, visible: true, leaving: false });
        setTimeout(() => {
            setToast(prev => ({ ...prev, leaving: true }));
            setTimeout(() => setToast({ message: '', type: '', visible: false, leaving: false }), 300);
        }, 3000);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'staffCode' ? value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8) : value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirm_password) {
            showToast('Passwords do not match!', 'error');
            return;
        }
        if (isStaff && formData.staffCode.length !== 8) {
            showToast('Staff code must be 8 characters', 'error');
            return;
        }

        if (!navigator.onLine) {
            showToast('No internet connection. Please check your network and try again.', 'error');
            return;
        }

        setLoading(true);
        try {
            const payload: Record<string, string> = {
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password,
            };
            if (isStaff) payload.staff_code = formData.staffCode;
            await client.post('/register', payload);
            showToast('Account created successfully!', 'success');
            setTimeout(() => navigate('/login'), 1500);
        } catch (error: any) {
            showToast(error.response?.data?.detail || error.response?.data?.message || 'Registration failed', 'error');
            setLoading(false);
        }
    };

    return <Register {...{ formData, handleChange, showPassword, setShowPassword, showConfirmPassword, setShowConfirmPassword, isStaff, setIsStaff, loading, handleSubmit, toast }} />;
}
