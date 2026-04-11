import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/auth.css';
import styles from './styles/forgot.module.css';

export default function Forgot({
    formData, handleChange, showNewPassword, setShowNewPassword,
    showConfirmPassword, setShowConfirmPassword, loading, handleSubmit, message
}) {
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

                    {message.text && (
                        <div className={`message ${message.type === 'error' ? 'error-message' : 'success-message'}`} style={{ display: 'flex' }}>
                            <i className={`fas ${message.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                            <span>{message.text}</span>
                        </div>
                    )}

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
                                    value={formData[field.name]} onChange={handleChange}
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
                                    value={formData[field.name]} onChange={handleChange}
                                    autoComplete="new-password"
                                />
                                <i className={`fas ${field.show ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                                   onClick={() => field.setShow(!field.show)}></i>
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