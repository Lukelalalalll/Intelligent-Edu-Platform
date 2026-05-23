import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '@/shared/api/client';
import toast from 'react-hot-toast';
import '../styles/auth.css';
import styles from '../styles/forgot.module.css';

export default function ForgotPage() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', newPassword: '', confirmPassword: '' });
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.newPassword !== formData.confirmPassword) {
            toast.error('Passwords do not match!');
            return;
        }

        setLoading(true);
        try {
            await client.post('/reset-password', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                new_password: formData.newPassword
            });
            toast.success('Password updated successfully!');
            setTimeout(() => navigate('/login'), 1500);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Verification failed');
            setLoading(false);
        }
    };

    return (
        <div className={`auth-page-root auth-wrapper ${styles.forgotWrapper}`}>
            <div className={`bg-orb ${styles.forgotOrb}`}></div>
            <div className="auth-container">
                <div className="auth-card" id="forgotCard">
                    <div className="auth-header">
                        <div className="header-icon"><i className="fas fa-user-shield"></i></div>
                        <h2>Reset Password</h2>
                        <p>Verify your account details to set a new password.</p>
                    </div>

                    <form className="auth-form" onSubmit={handleSubmit}>
                        <input type="text" name="fakeUsername" style={{display: 'none'}}/>
                        <input type="password" name="fakePassword" style={{display: 'none'}}/>
                        {[
                            {name: 'username', label: 'Username', icon: 'fa-user', type: 'text'},
                            {name: 'email', label: 'Registered Email', icon: 'fa-envelope', type: 'email'}
                        ].map(field => (
                            <div className="input-group" key={field.name}>
                                <div className="input-icon"><i className={`fas ${field.icon}`}></i></div>
                                <input
                                    type={field.type} id={field.name} name={field.name} placeholder=" " required
                                    value={formData[field.name as keyof typeof formData]} onChange={handleChange}
                                    autoComplete="off"
                                />
                                <label htmlFor={field.name}>{field.label}</label>
                                <div className="input-border"></div>
                            </div>
                        ))}

                        {[
                            {
                                name: 'newPassword',
                                label: 'New Password',
                                show: showNewPassword,
                                setShow: setShowNewPassword
                            },
                            {
                                name: 'confirmPassword',
                                label: 'Confirm Password',
                                show: showConfirmPassword,
                                setShow: setShowConfirmPassword
                            }
                        ].map(field => (
                            <div className="input-group" key={field.name}>
                                <div className="input-icon"><i className="fas fa-lock"></i></div>
                                <input
                                    type={field.show ? "text" : "password"} id={field.name} name={field.name}
                                    placeholder=" " required
                                    value={formData[field.name as keyof typeof formData]} onChange={handleChange}
                                    autoComplete="new-password"
                                />
                                <i className={`fas ${field.show ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                                   onClick={() => field.setShow(!field.show)} style={{ cursor: 'pointer' }}></i>
                                <label htmlFor={field.name}>{field.label}</label>
                                <div className="input-border"></div>
                            </div>
                        ))}

                        <button type="submit" className={`btn-submit ${loading ? 'loading' : ''}`} disabled={loading}>
                            {loading ? <><i className="fas fa-circle-notch fa-spin"></i> Updating...</> : <><span>Update Password</span><i
                                className="fas fa-arrow-right"></i></>}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p>Remember your password? <Link to="/login" className="highlight-link">Sign In</Link></p>
                        <Link to="/" className="back-home-link"><i className="fas fa-arrow-left"></i> Back to Home</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
