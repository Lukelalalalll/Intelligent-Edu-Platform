// Register.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth.css'; // 复用登录页的 CSS 样式

export default function Register({
    formData, handleChange, showPassword, setShowPassword,
    showConfirmPassword, setShowConfirmPassword, loading, handleSubmit, toast
}) {
    return (
        <>
            <div id="toast-container">
                {toast.visible && (
                    <div className={`custom-toast ${toast.type} ${toast.leaving ? 'toast-leave' : ''}`}>
                        <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} toast-icon`}></i>
                        <span>{toast.message}</span>
                    </div>
                )}
            </div>

            <div className="auth-wrapper">
                <div className="bg-orb"></div>
                <div className="auth-container">
                    <div className="auth-card" id="registerCard">
                        <div className="auth-header">
                            <h2>Join HKU Platform</h2>
                            <p>Start your intelligent learning journey</p>
                        </div>

                        <form className="auth-form" onSubmit={handleSubmit}>
                            {['username', 'email'].map((field) => (
                                <div className="input-group" key={field}>
                                    <div className="input-icon"><i className={`fas ${field === 'username' ? 'fa-user' : 'fa-envelope'}`}></i></div>
                                    <input
                                        type={field === 'email' ? 'email' : 'text'}
                                        id={field} name={field} placeholder=" " required
                                        value={formData[field]} onChange={handleChange}
                                    />
                                    <label htmlFor={field}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                                    <div className="input-border"></div>
                                </div>
                            ))}

                            {[ {key: 'password', show: showPassword, toggle: setShowPassword},
                               {key: 'confirm_password', show: showConfirmPassword, toggle: setShowConfirmPassword}
                            ].map((item) => (
                                <div className="input-group" key={item.key}>
                                    <div className="input-icon"><i className="fas fa-lock"></i></div>
                                    <input
                                        type={item.show ? "text" : "password"}
                                        id={item.key} name={item.key} placeholder=" " required
                                        value={formData[item.key]} onChange={handleChange}
                                    />
                                    <i className={`fas ${item.show ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                                       onClick={() => item.toggle(!item.show)}></i>
                                    <label htmlFor={item.key}>{item.key === 'password' ? 'Password' : 'Confirm Password'}</label>
                                    <div className="input-border"></div>
                                </div>
                            ))}

                            <button type="submit" className="btn-submit" disabled={loading}>
                                {loading ? <><i className="fas fa-circle-notch fa-spin"></i> Creating...</> : <><span>Create Account</span><i className="fas fa-arrow-right"></i></>}
                            </button>
                        </form>

                        <div className="auth-footer">
                            <p>Already have an account? <Link to="/login" className="highlight-link">Sign In</Link></p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}