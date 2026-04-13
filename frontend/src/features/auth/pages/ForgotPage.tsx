import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../../api/client';
import Forgot from '../components/Forgot';

export default function ForgotPage() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', newPassword: '', confirmPassword: '' });
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (message.text) setMessage({ type: '', text: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.newPassword !== formData.confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match!' });
            return;
        }

        setLoading(true);
        try {
            await client.post('/reset-password', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                new_password: formData.newPassword
            });
            setMessage({ type: 'success', text: 'Password updated successfully!' });
            setTimeout(() => navigate('/login'), 1500);
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Verification failed' });
            setLoading(false);
        }
    };

    return <Forgot {...{ formData, handleChange, showNewPassword, setShowNewPassword, showConfirmPassword, setShowConfirmPassword, loading, handleSubmit, message }} />;
}
