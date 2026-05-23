import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/store/useAuthStore';
import styles from '../styles/auth.module.css';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuthStore();

    // Form state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // UI state
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Refs for 3D effect
    const cardRef = useRef<HTMLDivElement>(null);
    const sheenRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
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
            });
        };

        document.addEventListener('mousemove', handleMouseMove, { passive: true });

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    const resetWillChange = (e: React.AnimationEvent<HTMLElement>) => {
        e.currentTarget.style.willChange = 'auto';
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

    const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setter(e.target.value);
        setErrorMsg('');
        setSuccessMsg('');
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username.trim() || !password.trim()) {
            setErrorMsg('Please fill in all fields.');
            return;
        }

        setIsLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            const response = await client.post('/login', {
                username,
                password
            });

            const userData = response.data.user;
            login(userData); // Use Zustand

            const searchParams = new URLSearchParams(location.search);
            const nextUrl = searchParams.get('next');

            if (nextUrl) {
                navigate(nextUrl);
            } else if (userData.role === 'student') {
                navigate('/home_student');
            } else {
                navigate('/');
            }
        } catch (error: any) {
            const errorDetail = error.response?.data?.detail || error.response?.data?.message || 'Login failed';
            setErrorMsg(errorDetail);
            setIsLoading(false);
        }
    };

    return (
        <div className={`auth-page-root ${styles.authWrapper} ${styles.splitLayout}`}>
            <div className={styles.bgOrb}></div>

            <div className={styles.welcomeSection}>
                <h1 className={styles.welcomeTitle}>
                    <span className={styles.textLine} onAnimationEnd={resetWillChange}>Welcome to</span>
                    <span className={`${styles.textLine} ${styles.textGlow}`} onAnimationEnd={resetWillChange}>HKU Intelligent</span>
                    <span className={styles.textLine} onAnimationEnd={resetWillChange}>Education Platform</span>
                </h1>
                <p className={styles.welcomeSubtitle} onAnimationEnd={resetWillChange}>
                    Empowering your future with AI-driven learning experiences.
                    <br />Sign in to continue your E-learning journey.
                </p>
            </div>

            <div className={styles.authContainer}>
                <div
                    className={styles.authCard}
                    id="loginCard"
                    ref={cardRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onAnimationEnd={resetWillChange}
                >
                    <div
                        ref={sheenRef}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4), transparent 70%)',
                            opacity: '0', pointerEvents: 'none', borderRadius: 'var(--auth-radius-lg, var(--radius-lg))', zIndex: '10',
                            mixBlendMode: 'overlay', transition: 'opacity 0.4s ease'
                        }}
                    ></div>

                    <div className={styles.authHeader}>
                        <div className={styles.headerIcon}><i className="fas fa-user-circle"></i></div>
                        <h2>Welcome Back</h2>
                        <p>Sign in to continue your learning journey</p>
                    </div>

                    <div className={`${styles.message} ${styles.errorMessage}`} style={{ display: errorMsg ? 'flex' : 'none' }}>
                        <i className="fas fa-exclamation-circle"></i> <span>{errorMsg}</span>
                    </div>
                    <div className={`${styles.message} ${styles.successMessage}`} style={{ display: successMsg ? 'flex' : 'none' }}>
                        <i className="fas fa-check-circle"></i> <span>{successMsg}</span>
                    </div>

                    <form className={styles.authForm} onSubmit={handleLogin}>
                        <div className={styles.inputGroup}>
                            <div className={styles.inputIcon}><i className="fas fa-user"></i></div>
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
                            <div className={styles.inputBorder}></div>
                        </div>

                        <div className={styles.inputGroup}>
                            <div className={styles.inputIcon}><i className="fas fa-lock"></i></div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                placeholder=" "
                                required
                                autoComplete="new-password"
                                value={password}
                                onChange={handleInputChange(setPassword)}
                            />
                            <i
                                className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ cursor: 'pointer' }}
                            ></i>
                            <label htmlFor="password">Password</label>
                            <div className={styles.inputBorder}></div>
                        </div>

                        <div className={styles.formOptions}>
                            <Link to="/forgot-password" className={styles.forgotLink}>Forgot Password?</Link>
                        </div>

                        <button
                            type="submit"
                            className={`${styles.btnSubmit}${isLoading ? ' ' + styles.loading : ''}`}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <><i className="fas fa-circle-notch fa-spin"></i> Signing In...</>
                            ) : (
                                <><span>Sign In</span><i className="fas fa-arrow-right"></i></>
                            )}
                        </button>
                    </form>

                    <div className={styles.authFooter}>
                        <p>Don't have an account? <Link to="/register" className={styles.highlightLink}>Create Account</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
