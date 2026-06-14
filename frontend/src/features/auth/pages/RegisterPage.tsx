import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import client from '@/shared/api/client';
import toast from 'react-hot-toast';
import { useI18n } from '@/shared/i18n';
import { useAuthStore } from '@/shared/store/useAuthStore';
import GoogleAuthSection from '../components/GoogleAuthSection';
import styles from '../styles/auth.module.css';

export default function RegisterPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuthStore();
    const { t } = useI18n();
    const [formData, setFormData] = useState({ username: '', email: '', password: '', confirm_password: '', staffCode: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isStaff, setIsStaff] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'staffCode' ? value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8) : value }));
    };

    const completeAuth = (userData: any) => {
        login(userData);

        const searchParams = new URLSearchParams(location.search);
        const nextUrl = searchParams.get('next');

        if (nextUrl) {
            navigate(nextUrl);
        } else if (userData.role === 'student') {
            navigate('/home_student');
        } else {
            navigate('/');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.password !== formData.confirm_password) {
            toast.error(t('auth.passwordMismatch'));
            return;
        }
        if (isStaff && formData.staffCode.length !== 8) {
            toast.error(t('auth.staffCodeInvalid'));
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
            toast.success(t('auth.accountCreated'));
            setTimeout(() => navigate('/login'), 1500);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || error.response?.data?.message || t('auth.registrationFailed'));
            setLoading(false);
        }
    };

    return (
        <div className={`auth-page-root ${styles.authWrapper}`}>
            <div className={styles.bgOrb}></div>
            <div className={styles.authContainer}>
                <div className={styles.authCard} id="registerCard">
                    <div className={styles.authHeader}>
                        <h2>{t('auth.register.title')}</h2>
                        <p>{t('auth.register.subtitle')}</p>
                    </div>

                    <form className={styles.authForm} onSubmit={handleSubmit}>
                        {['username', 'email'].map((field) => (
                            <div className={styles.inputGroup} key={field}>
                                <div className={styles.inputIcon}><i className={`fas ${field === 'username' ? 'fa-user' : 'fa-envelope'}`}></i></div>
                                <input
                                    type={field === 'email' ? 'email' : 'text'}
                                    id={field} name={field} autoComplete="off" placeholder=" " required
                                    value={formData[field as keyof typeof formData]} onChange={handleChange}
                                />
                                <label htmlFor={field}>{field === 'username' ? t('auth.username') : t('auth.email')}</label>
                                <div className={styles.inputBorder}></div>
                            </div>
                        ))}

                        {[ {key: 'password', show: showPassword, toggle: setShowPassword},
                           {key: 'confirm_password', show: showConfirmPassword, toggle: setShowConfirmPassword}
                        ].map((item) => (
                            <div className={styles.inputGroup} key={item.key}>
                                <div className={styles.inputIcon}><i className="fas fa-lock"></i></div>
                                <input
                                    type={item.show ? "text" : "password"}
                                    id={item.key} name={item.key} autoComplete="new-password" placeholder=" " required
                                    value={formData[item.key as keyof typeof formData]} onChange={handleChange}
                                />
                                <i className={`fas ${item.show ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                   onClick={() => item.toggle(!item.show)}></i>
                                <label htmlFor={item.key}>{item.key === 'password' ? t('auth.password') : t('auth.confirmPassword')}</label>
                                <div className={styles.inputBorder}></div>
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                            <button
                                type="button"
                                onClick={() => setIsStaff(false)}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: '10px', border: '1.5px solid',
                                    borderColor: !isStaff ? '#007B55' : 'rgba(0,0,0,0.12)',
                                    background: !isStaff ? 'rgba(0,123,85,0.08)' : 'transparent',
                                    color: !isStaff ? '#007B55' : '#6b7280',
                                    fontWeight: !isStaff ? 600 : 400,
                                    cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s',
                                }}
                            >
                                <i className="fas fa-graduation-cap" style={{ marginRight: '6px' }}></i>{t('auth.student')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsStaff(true)}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: '10px', border: '1.5px solid',
                                    borderColor: isStaff ? '#007B55' : 'rgba(0,0,0,0.12)',
                                    background: isStaff ? 'rgba(0,123,85,0.08)' : 'transparent',
                                    color: isStaff ? '#007B55' : '#6b7280',
                                    fontWeight: isStaff ? 600 : 400,
                                    cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s',
                                }}
                            >
                                <i className="fas fa-chalkboard-teacher" style={{ marginRight: '6px' }}></i>{t('auth.staff')}
                            </button>
                        </div>

                        {isStaff && (
                            <div className={styles.inputGroup} style={{ marginTop: '8px' }}>
                                <div className={styles.inputIcon}><i className="fas fa-key"></i></div>
                                <input
                                    type="text"
                                    id="staffCode" name="staffCode" autoComplete="off" placeholder=" "
                                    required={isStaff} maxLength={8}
                                    value={formData.staffCode} onChange={handleChange}
                                    style={{ letterSpacing: '2px', fontFamily: 'monospace', textTransform: 'uppercase' }}
                                />
                                <label htmlFor="staffCode">{t('auth.staffCode')}</label>
                                <div className={styles.inputBorder}></div>
                            </div>
                        )}

                        <button type="submit" className={styles.btnSubmit} disabled={loading} style={{ marginTop: '12px' }}>
                            {loading ? <><i className="fas fa-circle-notch fa-spin"></i> {t('auth.creating')}</> : <><span>{t('auth.createAccount')}</span><i className="fas fa-arrow-right"></i></>}
                        </button>
                    </form>

                    <GoogleAuthSection mode="register" onAuthenticated={completeAuth} />

                    <div className={styles.authFooter}>
                        <p>{t('auth.alreadyHaveAccount')} <Link to="/login" className={styles.highlightLink}>{t('auth.signIn')}</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
