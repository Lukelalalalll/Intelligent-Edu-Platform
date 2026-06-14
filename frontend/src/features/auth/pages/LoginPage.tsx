import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/store/useAuthStore';
import { useI18n } from '@/shared/i18n';
import usePrefersReducedMotion from '@/shared/hooks/usePrefersReducedMotion';
import GoogleAuthSection from '../components/GoogleAuthSection';
import styles from '../styles/auth.module.css';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuthStore();
    const { t } = useI18n();
    const prefersReducedMotion = usePrefersReducedMotion();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [allowPointerMotion, setAllowPointerMotion] = useState(false);
    const [mfaChallenge, setMfaChallenge] = useState<null | {
        challengeId: string;
        expiresAt: string;
        method: string;
    }>(null);

    const cardRef = useRef<HTMLDivElement>(null);
    const sheenRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const mediaQuery = window.matchMedia('(pointer: fine)');
        const sync = () => setAllowPointerMotion(mediaQuery.matches && !prefersReducedMotion);

        sync();
        mediaQuery.addEventListener('change', sync);
        return () => mediaQuery.removeEventListener('change', sync);
    }, [prefersReducedMotion]);

    useEffect(() => () => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
    }, []);

    const resetCardPose = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (!cardRef.current || !sheenRef.current) {
            return;
        }

        cardRef.current.style.transform = 'translate3d(0, 0, 0)';
        cardRef.current.style.willChange = 'auto';
        sheenRef.current.style.opacity = '0';
        sheenRef.current.style.willChange = 'auto';
    }, []);

    useEffect(() => {
        if (!allowPointerMotion) {
            resetCardPose();
        }
    }, [allowPointerMotion, resetCardPose]);

    const resetWillChange = (event: React.AnimationEvent<HTMLElement>) => {
        event.currentTarget.style.willChange = 'auto';
    };

    const handleCardMouseEnter = useCallback(() => {
        if (!allowPointerMotion || !cardRef.current || !sheenRef.current) {
            return;
        }

        cardRef.current.style.transition = 'transform 120ms ease-out';
        cardRef.current.style.willChange = 'transform';
        sheenRef.current.style.willChange = 'opacity, background';
    }, [allowPointerMotion]);

    const handleCardMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!allowPointerMotion || !cardRef.current || !sheenRef.current || rafRef.current) {
            return;
        }

        const { clientX, clientY } = event;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;

            if (!cardRef.current || !sheenRef.current) {
                return;
            }

            const rect = cardRef.current.getBoundingClientRect();
            const offsetX = clientX - rect.left;
            const offsetY = clientY - rect.top;
            const rotateX = ((offsetY / rect.height) - 0.5) * -7;
            const rotateY = ((offsetX / rect.width) - 0.5) * 7;

            cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(0, -2px, 0)`;
            sheenRef.current.style.background = `radial-gradient(circle at ${offsetX}px ${offsetY}px, rgba(255,255,255,0.24), transparent 58%)`;
            sheenRef.current.style.opacity = '1';
        });
    }, [allowPointerMotion]);

    const handleCardMouseLeave = useCallback(() => {
        if (!cardRef.current || !sheenRef.current) {
            return;
        }

        cardRef.current.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        sheenRef.current.style.transition = 'opacity 180ms ease-out';
        resetCardPose();
    }, [resetCardPose]);

    const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        setter(event.target.value);
        setErrorMsg('');
        setSuccessMsg('');
    };

    const completeLogin = (userData: any) => {
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

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!username.trim() || !password.trim() || (mfaChallenge && !mfaCode.trim())) {
            setErrorMsg(t('auth.fillAll'));
            return;
        }

        setIsLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            if (mfaChallenge) {
                const response = await client.post('/login/mfa/verify', {
                    challenge_id: mfaChallenge.challengeId,
                    code: mfaCode.trim(),
                });
                setSuccessMsg(t('auth.mfaVerified'));
                completeLogin(response.data.user);
            } else {
                const response = await client.post('/login', {
                    username,
                    password,
                });

                if (response.data?.mfaRequired) {
                    setMfaChallenge({
                        challengeId: response.data.challengeId,
                        expiresAt: response.data.expiresAt,
                        method: response.data.method,
                    });
                    setMfaCode('');
                    setSuccessMsg(t('auth.mfaRequired'));
                    setIsLoading(false);
                    return;
                }

                completeLogin(response.data.user);
            }
        } catch (error: any) {
            const errorDetail =
                error.response?.data?.detail ||
                error.response?.data?.message ||
                t('auth.loginFailed');
            setErrorMsg(errorDetail);
            setIsLoading(false);
        }
    };

    const handleBackToPassword = () => {
        setMfaChallenge(null);
        setMfaCode('');
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(false);
    };

    const mfaExpiryText = mfaChallenge?.expiresAt
        ? new Date(mfaChallenge.expiresAt).toLocaleTimeString()
        : '';

    return (
        <div className={`auth-page-root ${styles.authWrapper} ${styles.splitLayout}`}>
            <div className={styles.bgOrb}></div>

            <div className={styles.welcomeSection}>
                <h1 className={styles.welcomeTitle}>
                    <span className={styles.textLine} onAnimationEnd={resetWillChange}>{t('auth.login.hero.line1')}</span>
                    <span className={`${styles.textLine} ${styles.textGlow}`} onAnimationEnd={resetWillChange}>{t('auth.login.hero.line2')}</span>
                    <span className={styles.textLine} onAnimationEnd={resetWillChange}>{t('auth.login.hero.line3')}</span>
                </h1>
                <p className={styles.welcomeSubtitle} onAnimationEnd={resetWillChange}>
                    {t('auth.login.hero.subtitle1')}
                    <br />{t('auth.login.hero.subtitle2')}
                </p>
            </div>

            <div className={styles.authContainer}>
                <div
                    className={styles.authCard}
                    id="loginCard"
                    ref={cardRef}
                    onMouseEnter={handleCardMouseEnter}
                    onMouseMove={handleCardMouseMove}
                    onMouseLeave={handleCardMouseLeave}
                    onAnimationEnd={resetWillChange}
                >
                    <div
                        ref={sheenRef}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.28), transparent 70%)',
                            opacity: 0,
                            pointerEvents: 'none',
                            borderRadius: 'var(--auth-radius-lg, var(--radius-lg))',
                            zIndex: 10,
                            mixBlendMode: 'overlay',
                            transition: 'opacity 0.2s ease-out',
                        }}
                    ></div>

                    <div className={styles.authHeader}>
                        <div className={styles.headerIcon}><i className={`fas ${mfaChallenge ? 'fa-shield-alt' : 'fa-user-circle'}`}></i></div>
                        <h2>{mfaChallenge ? t('auth.mfaTitle') : t('auth.login.title')}</h2>
                        <p>{mfaChallenge ? t('auth.mfaSubtitle') : t('auth.login.subtitle')}</p>
                    </div>

                    <div className={`${styles.message} ${styles.errorMessage}`} style={{ display: errorMsg ? 'flex' : 'none' }}>
                        <i className="fas fa-exclamation-circle"></i> <span>{errorMsg}</span>
                    </div>
                    <div className={`${styles.message} ${styles.successMessage}`} style={{ display: successMsg ? 'flex' : 'none' }}>
                        <i className="fas fa-check-circle"></i> <span>{successMsg}</span>
                    </div>

                    <form className={styles.authForm} onSubmit={handleLogin}>
                        {!mfaChallenge ? (
                            <>
                                <div className={styles.inputGroup}>
                                    <div className={styles.inputIcon}><i className="fas fa-user"></i></div>
                                    <input
                                        type="text"
                                        id="username"
                                        placeholder=" "
                                        required
                                        autoComplete="off"
                                        readOnly
                                        onFocus={(event) => event.target.removeAttribute('readonly')}
                                        value={username}
                                        onChange={handleInputChange(setUsername)}
                                    />
                                    <label htmlFor="username">{t('auth.username')}</label>
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
                                    <button
                                        type="button"
                                        className={styles.togglePassword}
                                        onClick={() => setShowPassword((value) => !value)}
                                        aria-label="Toggle password visibility"
                                    >
                                        <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                    <label htmlFor="password">{t('auth.password')}</label>
                                </div>

                                <div className={styles.formOptions}>
                                    <Link to="/forgot-password" className={styles.forgotLink}>{t('auth.forgotPassword')}</Link>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.mfaNotice}>
                                    <strong>{t('auth.mfaRequired')}</strong>
                                    <span>{t('auth.mfaExpiry', { time: mfaExpiryText || '--' })}</span>
                                </div>
                                <div className={styles.inputGroup}>
                                    <div className={styles.inputIcon}><i className="fas fa-key"></i></div>
                                    <input
                                        type="text"
                                        id="mfaCode"
                                        placeholder=" "
                                        required
                                        autoComplete="one-time-code"
                                        inputMode="numeric"
                                        value={mfaCode}
                                        onChange={handleInputChange(setMfaCode)}
                                    />
                                    <label htmlFor="mfaCode">{t('auth.mfaCode')}</label>
                                </div>
                            </>
                        )}

                        <button
                            type="submit"
                            className={`${styles.btnSubmit}${isLoading ? ` ${styles.loading}` : ''}`}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <><i className="fas fa-circle-notch fa-spin"></i> {t('auth.signingIn')}</>
                            ) : (
                                <><span>{mfaChallenge ? t('auth.verifyMfa') : t('auth.signIn')}</span><i className="fas fa-arrow-right"></i></>
                            )}
                        </button>
                        {mfaChallenge && (
                            <button type="button" className={styles.secondaryAction} onClick={handleBackToPassword}>
                                {t('auth.useDifferentAccount')}
                            </button>
                        )}
                    </form>

                    {!mfaChallenge ? <GoogleAuthSection mode="login" onAuthenticated={completeLogin} /> : null}

                    <div className={styles.authFooter}>
                        <p>{t('auth.noAccount')} <Link to="/register" className={styles.highlightLink}>{t('auth.createAccount')}</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
