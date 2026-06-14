import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '@/shared/api/client';
import toast from 'react-hot-toast';
import { useI18n } from '@/shared/i18n';
import authStyles from '../styles/auth.module.css';
import styles from '../styles/forgot.module.css';

export default function ForgotPage() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [mode, setMode] = useState<'request' | 'confirm'>('request');
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        token: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [devResetToken, setDevResetToken] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        setLoading(true);
        try {
            if (mode === 'request') {
                const response = await client.post('/password-reset/request', {
                    username: formData.username.trim(),
                    email: formData.email.trim(),
                });
                const token = response.data?.dev_reset_token || '';
                setDevResetToken(token);
                if (token) {
                    setFormData((prev) => ({ ...prev, token }));
                }
                toast.success(t('auth.passwordResetRequested'));
                setMode('confirm');
            } else {
                if (formData.newPassword !== formData.confirmPassword) {
                    toast.error(t('auth.passwordMismatch'));
                    setLoading(false);
                    return;
                }
                await client.post('/password-reset/confirm', {
                    token: formData.token.trim(),
                    new_password: formData.newPassword,
                });
                toast.success(t('auth.passwordUpdated'));
                setTimeout(() => navigate('/login'), 1500);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.detail || error.response?.data?.message || t('auth.verificationFailed'));
            setLoading(false);
            return;
        }
        setLoading(false);
    };

    return (
        <div className={`auth-page-root ${authStyles.authWrapper} ${styles.forgotWrapper}`}>
            <div className={`${authStyles.bgOrb} ${styles.forgotOrb}`}></div>

            <div className={authStyles.authContainer}>
                <div className={`${authStyles.authCard} ${styles.compactCard}`}>
                    <div className={authStyles.authHeader}>
                        <div className={authStyles.headerIcon}>
                            <i className="fas fa-user-shield"></i>
                        </div>
                        <h2>{mode === 'request' ? t('auth.forgot.title') : t('auth.resetConfirm.title')}</h2>
                        <p>{mode === 'request' ? t('auth.forgot.subtitle') : t('auth.resetConfirm.subtitle')}</p>
                    </div>

                    <form className={authStyles.authForm} onSubmit={handleSubmit}>
                        <input type="text" name="fakeUsername" style={{ display: 'none' }} />
                        <input type="password" name="fakePassword" style={{ display: 'none' }} />

                        {mode === 'request' ? (
                            [
                                { name: 'username', label: t('auth.username'), icon: 'fa-user', type: 'text' },
                                { name: 'email', label: t('auth.registeredEmail'), icon: 'fa-envelope', type: 'email' },
                            ].map((field) => (
                                <div className={authStyles.inputGroup} key={field.name}>
                                    <div className={authStyles.inputIcon}>
                                        <i className={`fas ${field.icon}`}></i>
                                    </div>
                                    <input
                                        type={field.type}
                                        id={field.name}
                                        name={field.name}
                                        placeholder=" "
                                        required={field.name === 'email'}
                                        value={formData[field.name as keyof typeof formData]}
                                        onChange={handleChange}
                                        autoComplete="off"
                                    />
                                    <label htmlFor={field.name}>{field.label}</label>
                                </div>
                            ))
                        ) : (
                            <>
                                <div className={authStyles.inputGroup}>
                                    <div className={authStyles.inputIcon}>
                                        <i className="fas fa-key"></i>
                                    </div>
                                    <input
                                        type="text"
                                        id="token"
                                        name="token"
                                        placeholder=" "
                                        required
                                        value={formData.token}
                                        onChange={handleChange}
                                        autoComplete="off"
                                    />
                                    <label htmlFor="token">{t('auth.resetToken')}</label>
                                </div>

                                {devResetToken ? (
                                    <div className={styles.devTokenBox}>
                                        <span>{t('auth.resetTokenPreview')}</span>
                                        <code>{devResetToken}</code>
                                    </div>
                                ) : null}
                            </>
                        )}

                        {mode === 'confirm'
                            ? [
                                {
                                    name: 'newPassword',
                                    label: t('auth.newPassword'),
                                    show: showNewPassword,
                                    toggle: setShowNewPassword,
                                },
                                {
                                    name: 'confirmPassword',
                                    label: t('auth.confirmPassword'),
                                    show: showConfirmPassword,
                                    toggle: setShowConfirmPassword,
                                },
                            ].map((field) => (
                                <div className={authStyles.inputGroup} key={field.name}>
                                    <div className={authStyles.inputIcon}>
                                        <i className="fas fa-lock"></i>
                                    </div>
                                    <input
                                        type={field.show ? 'text' : 'password'}
                                        id={field.name}
                                        name={field.name}
                                        placeholder=" "
                                        required
                                        value={formData[field.name as keyof typeof formData]}
                                        onChange={handleChange}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className={authStyles.togglePassword}
                                        onClick={() => field.toggle(!field.show)}
                                        aria-label="Toggle password visibility"
                                    >
                                        <i className={`fas ${field.show ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                    <label htmlFor={field.name}>{field.label}</label>
                                </div>
                            ))
                            : null}

                        <button
                            type="submit"
                            className={`${authStyles.btnSubmit}${loading ? ` ${authStyles.loading}` : ''}`}
                            disabled={loading}
                        >
                            {loading ? (
                                <><i className="fas fa-circle-notch fa-spin"></i> {t('auth.updating')}</>
                            ) : (
                                <>
                                    <span>{mode === 'request' ? t('auth.requestReset') : t('auth.updatePassword')}</span>
                                    <i className="fas fa-arrow-right"></i>
                                </>
                            )}
                        </button>
                    </form>

                    <div className={`${authStyles.authFooter} ${styles.footerStack}`}>
                        <p>
                            {t('auth.rememberPassword')}
                            <Link to="/login" className={authStyles.highlightLink}> {t('auth.signIn')}</Link>
                        </p>
                        <Link to="/" className={`${authStyles.backHomeLink} ${styles.backHomeLink}`}>
                            <i className="fas fa-arrow-left"></i> {t('auth.backHome')}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
