import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../styles/auth.module.css';

export default function Register({
    formData, handleChange, showPassword, setShowPassword,
    showConfirmPassword, setShowConfirmPassword, isStaff, setIsStaff,
    loading, handleSubmit, toast
}) {
    return (
        <>
            <div className={styles.toastContainer}>
                {toast.visible && (
                    <div className={[styles.customToast, styles[toast.type], toast.leaving ? styles.toastLeave : ''].filter(Boolean).join(' ')}>
                        <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} ${styles.toastIcon}`}></i>
                        <span>{toast.message}</span>
                    </div>
                )}
            </div>

            <div className={`auth-page-root ${styles.authWrapper}`}>
                <div className={styles.bgOrb}></div>
                <div className={styles.authContainer}>
                    <div className={styles.authCard} id="registerCard">
                        <div className={styles.authHeader}>
                            <h2>Join HKU Platform</h2>
                            <p>Start your intelligent learning journey</p>
                        </div>

                        <form className={styles.authForm} onSubmit={handleSubmit}>
                            {['username', 'email'].map((field) => (
                                <div className={styles.inputGroup} key={field}>
                                    <div className={styles.inputIcon}><i className={`fas ${field === 'username' ? 'fa-user' : 'fa-envelope'}`}></i></div>
                                    <input
                                        type={field === 'email' ? 'email' : 'text'}
                                        id={field} name={field} autoComplete="off" placeholder=" " required
                                        value={formData[field]} onChange={handleChange}
                                    />
                                    <label htmlFor={field}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
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
                                        value={formData[item.key]} onChange={handleChange}
                                    />
                                    <i className={`fas ${item.show ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                       onClick={() => item.toggle(!item.show)}></i>
                                    <label htmlFor={item.key}>{item.key === 'password' ? 'Password' : 'Confirm Password'}</label>
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
                                    <i className="fas fa-graduation-cap" style={{ marginRight: '6px' }}></i>Student
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
                                    <i className="fas fa-chalkboard-teacher" style={{ marginRight: '6px' }}></i>University Staff
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
                                    <label htmlFor="staffCode">Staff Code (8 characters)</label>
                                    <div className={styles.inputBorder}></div>
                                </div>
                            )}

                            <button type="submit" className={styles.btnSubmit} disabled={loading} style={{ marginTop: '12px' }}>
                                {loading ? <><i className="fas fa-circle-notch fa-spin"></i> Creating...</> : <><span>Create Account</span><i className="fas fa-arrow-right"></i></>}
                            </button>
                        </form>

                        <div className={styles.authFooter}>
                            <p>Already have an account? <Link to="/login" className={styles.highlightLink}>Sign In</Link></p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
