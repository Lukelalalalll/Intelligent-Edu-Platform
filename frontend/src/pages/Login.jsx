// Login.jsx
import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth.css';

export default function Login({
    username, setUsername, password, setPassword, showPassword, setShowPassword,
    errorMsg, setErrorMsg, successMsg, setSuccessMsg, isLoading, handleLogin
}) {
    // 3D 动效需要的 Refs
    const cardRef = useRef(null);
    const sheenRef = useRef(null);

    // 1. 处理 3D 卡片悬浮特效
    const handleMouseMove = (e) => {
        if (!cardRef.current || !sheenRef.current) return;
        const card = cardRef.current;
        const sheen = sheenRef.current;

        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;

        const rotateX = (mouseY / rect.height) * -8;
        const rotateY = (mouseX / rect.width) * 8;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;

        const sheenX = e.clientX - rect.left;
        const sheenY = e.clientY - rect.top;
        sheen.style.background = `radial-gradient(circle at ${sheenX}px ${sheenY}px, rgba(255,255,255,0.3), transparent 60%)`;
        sheen.style.opacity = '1';
    };

    const handleMouseEnter = () => {
        if (cardRef.current) cardRef.current.style.transition = 'transform 0.1s ease-out';
    };

    const handleMouseLeave = () => {
        if (!cardRef.current || !sheenRef.current) return;
        const card = cardRef.current;
        const sheen = sheenRef.current;

        card.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        sheen.style.opacity = '0';
    };

    // 表单输入处理
    const handleInputChange = (setter) => (e) => {
        setter(e.target.value);
        setErrorMsg('');
        setSuccessMsg('');
    };

    return (
        <div className="auth-wrapper split-layout" onMouseMove={handleMouseMove}>
            <div className="bg-orb"></div>

            <div className="welcome-section">
                <h1 className="welcome-title">
                    <span className="text-line">Welcome to</span>
                    <span className="text-line text-glow">HKU Intelligent</span>
                    <span className="text-line">Education Platform</span>
                </h1>
                <p className="welcome-subtitle">
                    Empowering your future with AI-driven learning experiences.
                    <br />Sign in to continue your E-learning journey.
                </p>
            </div>

            <div className="auth-container">
                <div
                    className="auth-card"
                    id="loginCard"
                    ref={cardRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <div
                        ref={sheenRef}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4), transparent 70%)',
                            opacity: '0', pointerEvents: 'none', borderRadius: '24px', zIndex: '10',
                            mixBlendMode: 'overlay', transition: 'opacity 0.4s ease'
                        }}
                    ></div>

                    <div className="auth-header">
                        <div className="header-icon"><i className="fas fa-user-circle"></i></div>
                        <h2>Welcome Back</h2>
                        <p>Sign in to continue your learning journey</p>
                    </div>

                    {/* 消息提示框 */}
                    <div className="message error-message" style={{ display: errorMsg ? 'flex' : 'none' }}>
                        <i className="fas fa-exclamation-circle"></i> <span>{errorMsg}</span>
                    </div>
                    <div className="message success-message" style={{ display: successMsg ? 'flex' : 'none' }}>
                        <i className="fas fa-check-circle"></i> <span>{successMsg}</span>
                    </div>

                    <form className="auth-form" onSubmit={handleLogin}>
                        <div className="input-group">
                            <div className="input-icon"><i className="fas fa-user"></i></div>
                            <input
                                type="text"
                                id="username"
                                placeholder=" "
                                required
                                autoComplete="off"
                                readOnly
                                onFocus={(e) => e.target.removeAttribute('readonly')}
                                value={username}
                                onChange={handleInputChange(setUsername)}
                            />
                            <label htmlFor="username">Username</label>
                            <div className="input-border"></div>
                        </div>

                        <div className="input-group">
                            <div className="input-icon"><i className="fas fa-lock"></i></div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                placeholder=" "
                                required
                                autoComplete="off"
                                readOnly
                                onFocus={(e) => e.target.removeAttribute('readonly')}
                                value={password}
                                onChange={handleInputChange(setPassword)}
                            />
                            <i
                                className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ cursor: 'pointer' }}
                            ></i>

                            <label htmlFor="password">Password</label>
                            <div className="input-border"></div>
                        </div>

                        <div className="form-options">
                            <Link to="/forgot-password" className="forgot-link">Forgot Password?</Link>
                        </div>

                        <button type="submit" className={`btn-submit ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
                            {isLoading ? (
                                <><i className="fas fa-circle-notch fa-spin"></i> Signing In...</>
                            ) : (
                                <><span>Sign In</span><i className="fas fa-arrow-right"></i></>
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p>Don't have an account? <Link to="/register" className="highlight-link">Create Account</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
}