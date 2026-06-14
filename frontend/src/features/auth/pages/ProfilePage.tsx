import React, { useEffect, useState } from 'react';
import client from '@/shared/api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/useAuthStore';
import { useI18n } from '@/shared/i18n';
import styles from '../styles/profile.module.css';

interface AuthSessionItem {
    sessionId: string;
    createdAt: string | null;
    lastSeenAt: string | null;
    lastRotatedAt: string | null;
    expiresAt: string | null;
    current: boolean;
    amr: string[];
}

interface SecurityState {
    mfa: {
        enabled: boolean;
        totpConfigured: boolean;
        backupCodesRemaining: number;
        preferredMethod: string;
        enrolledAt: string | null;
    };
    enrollmentPending: {
        active: boolean;
        startedAt: string | null;
    };
}

export default function ProfilePage() {
    const navigate = useNavigate();
    const { user, updateProfile, logout } = useAuthStore();
    const { t } = useI18n();

    const [formData, setFormData] = useState({
        username: user?.username || '',
        email: user?.email || '',
        currentPassword: '',
        password: ''
    });
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [profileCourses, setProfileCourses] = useState<any[]>([]);
    const [courseSemester, setCourseSemester] = useState('');
    const [isCoursesLoading, setIsCoursesLoading] = useState(true);

    // History TTL settings
    const [historyTtlDays, setHistoryTtlDays] = useState(90);
    const [ttlInput, setTtlInput] = useState('90');
    const [ttlPermanent, setTtlPermanent] = useState(false);
    const [ttlSaving, setTtlSaving] = useState(false);
    const [authSessions, setAuthSessions] = useState<AuthSessionItem[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [revokingSessionId, setRevokingSessionId] = useState('');
    const [loggingOutAll, setLoggingOutAll] = useState(false);
    const [securityState, setSecurityState] = useState<SecurityState | null>(null);
    const [mfaConfirmCode, setMfaConfirmCode] = useState('');
    const [mfaDisableCode, setMfaDisableCode] = useState('');
    const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
    const [mfaSecret, setMfaSecret] = useState('');
    const [mfaOtpUri, setMfaOtpUri] = useState('');
    const [mfaStepUpCode, setMfaStepUpCode] = useState('');
    const [securityBusy, setSecurityBusy] = useState(false);

    const getRoleInfo = (role?: string) => {
        switch (role) {
            case 'admin': return { icon: 'fa-shield-alt', text: t('profile.role.admin') };
            case 'teacher': return { icon: 'fa-chalkboard-teacher', text: t('profile.role.teacher') };
            default: return { icon: 'fa-user-graduate', text: t('profile.role.student') };
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setShowModal(true);
    };

    const handleSaveProfile = async () => {
        setShowModal(false);
        setIsLoading(true);
        try {
            await client.post('/profile/update', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                current_password: formData.currentPassword,
                password: formData.password.trim()
            });

            updateProfile({ username: formData.username, email: formData.email });
            toast.success(t('profile.updated'));
            if (formData.password.trim()) {
                await client.post('/logout').catch(() => undefined);
                logout();
                setTimeout(() => navigate('/login'), 600);
                return;
            }
            setFormData((prev) => ({ ...prev, currentPassword: '', password: '' }));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || error.response?.data?.message || t('profile.updateFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    const formatSessionTime = (value: string | null) => {
        if (!value) {
            return t('profile.notAvailable');
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return t('profile.notAvailable');
        }
        return date.toLocaleString();
    };

    const loadAuthSessions = async (isMounted?: () => boolean) => {
        try {
            setSessionsLoading(true);
            const response = await client.get('/sessions');
            if (isMounted && !isMounted()) {
                return;
            }
            setAuthSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
        } catch {
            if (!isMounted || isMounted()) {
                setAuthSessions([]);
            }
        } finally {
            if (!isMounted || isMounted()) {
                setSessionsLoading(false);
            }
        }
    };

    const handleRevokeSession = async (sessionId: string) => {
        setRevokingSessionId(sessionId);
        try {
            await client.delete(`/sessions/${sessionId}`);
            setAuthSessions((prev) => prev.filter((item) => item.sessionId !== sessionId));
            toast.success('Session revoked');
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to revoke session');
        } finally {
            setRevokingSessionId('');
        }
    };

    const handleLogoutAll = async () => {
        setLoggingOutAll(true);
        try {
            await client.post('/logout-all');
            logout();
            toast.success('All sessions signed out');
            setTimeout(() => navigate('/login'), 300);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to sign out all sessions');
        } finally {
            setLoggingOutAll(false);
        }
    };

    const loadSecurityState = async () => {
        try {
            const response = await client.get('/profile/security');
            setSecurityState(response.data);
        } catch {
            setSecurityState(null);
        }
    };

    const handleStartMfa = async () => {
        if (!formData.currentPassword.trim()) {
            toast.error(t('profile.securityPasswordRequired'));
            return;
        }
        setSecurityBusy(true);
        try {
            const response = await client.post('/profile/security/mfa/start', {
                current_password: formData.currentPassword,
            });
            setMfaSecret(response.data?.secret || '');
            setMfaOtpUri(response.data?.otpauthUri || '');
            await loadSecurityState();
            toast.success(t('profile.mfaStarted'));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || t('profile.updateFailed'));
        } finally {
            setSecurityBusy(false);
        }
    };

    const handleConfirmMfa = async () => {
        if (!mfaConfirmCode.trim()) {
            toast.error(t('profile.mfaCodeRequired'));
            return;
        }
        setSecurityBusy(true);
        try {
            const response = await client.post('/profile/security/mfa/confirm', {
                code: mfaConfirmCode,
            });
            setMfaBackupCodes(Array.isArray(response.data?.backupCodes) ? response.data.backupCodes : []);
            setMfaConfirmCode('');
            setMfaSecret('');
            setMfaOtpUri('');
            await loadSecurityState();
            toast.success(t('profile.mfaEnabled'));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || t('profile.updateFailed'));
        } finally {
            setSecurityBusy(false);
        }
    };

    const handleDisableMfa = async () => {
        if (!mfaDisableCode.trim()) {
            toast.error(t('profile.mfaCodeRequired'));
            return;
        }
        setSecurityBusy(true);
        try {
            await client.post('/profile/security/mfa/disable', {
                current_password: formData.currentPassword,
                code: mfaDisableCode,
            });
            setMfaDisableCode('');
            setMfaBackupCodes([]);
            await loadSecurityState();
            toast.success(t('profile.mfaDisabled'));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || t('profile.updateFailed'));
        } finally {
            setSecurityBusy(false);
        }
    };

    const handleRegenerateBackupCodes = async () => {
        if (!formData.currentPassword.trim()) {
            toast.error(t('profile.securityPasswordRequired'));
            return;
        }
        setSecurityBusy(true);
        try {
            const response = await client.post('/profile/security/mfa/backup-codes/regenerate', {
                current_password: formData.currentPassword,
            });
            setMfaBackupCodes(Array.isArray(response.data?.backupCodes) ? response.data.backupCodes : []);
            await loadSecurityState();
            toast.success(t('profile.backupCodesUpdated'));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || t('profile.updateFailed'));
        } finally {
            setSecurityBusy(false);
        }
    };

    const handleVerifyStepUp = async () => {
        if (!mfaStepUpCode.trim()) {
            toast.error(t('profile.mfaCodeRequired'));
            return;
        }
        setSecurityBusy(true);
        try {
            await client.post('/step-up/verify', { code: mfaStepUpCode });
            setMfaStepUpCode('');
            await loadSecurityState();
            toast.success(t('profile.stepUpVerified'));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || t('profile.updateFailed'));
        } finally {
            setSecurityBusy(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        const stillMounted = () => isMounted;

        const loadProfileCourses = async () => {
            try {
                setIsCoursesLoading(true);
                const response = await client.get('/profile/courses');
                if (!isMounted) return;
                setProfileCourses(response.data?.courses || []);
                setCourseSemester(response.data?.semester || '');
            } catch (error) {
                if (!isMounted) return;
                setProfileCourses([]);
            } finally {
                if (isMounted) setIsCoursesLoading(false);
            }
        };

        const loadHistorySettings = async () => {
            try {
                const res = await client.get('/profile/history-settings');
                if (!isMounted) return;
                const days = res.data?.history_ttl_days ?? 90;
                setHistoryTtlDays(days);
                setTtlInput(days === 0 ? '' : String(days));
                setTtlPermanent(days === 0);
            } catch {
                // ignore
            }
        };

        loadProfileCourses();
        loadHistorySettings();
        loadSecurityState();
        void loadAuthSessions(stillMounted);
        return () => {
            isMounted = false;
        };
    }, []);

    const handleSaveHistoryTtl = async () => {
        const days = ttlPermanent ? 0 : parseInt(ttlInput, 10);
        if (!ttlPermanent && (isNaN(days) || days < 1)) {
            toast.error(t('profile.ttlInvalid'));
            return;
        }
        setTtlSaving(true);
        try {
            await client.post('/profile/history-settings', { history_ttl_days: days });
            setHistoryTtlDays(days);
            toast.success(t('profile.ttlSaved'));
        } catch {
            toast.error(t('profile.ttlFailed'));
        } finally {
            setTtlSaving(false);
        }
    };

    if (!user) return null;

    const isTeacher = user?.role === 'teacher';
    const courseTitle = isTeacher ? t('profile.teachingCourses') : t('profile.enrolledCourses');
    const courseSubtitle = isTeacher
        ? t('profile.currentSemester', { semester: courseSemester || t('profile.notAvailable') })
        : t('profile.linkedCourses');
    const roleInfo = getRoleInfo(user?.role);

    return (
        <>
            <div className={`global-profile-wrapper ${styles.profileWrapper}`}>
                <div className={styles.bgOrb}></div>
                <div className={styles.profileContainer}>
                    <div className={styles.profileRail}>
                        <div className={`${styles.profileLane} ${styles.profileLaneHeader}`}>
                            <div className={styles.profileHeaderCard}>
                                <div className={styles.avatarCircle}><i className="fas fa-user-astronaut"></i></div>
                                <div className={styles.profileInfo}>
                                    <h2>{user.username}</h2>
                                    <p><i className="fas fa-envelope"></i> {user.email}</p>
                                    <div className={`${styles.roleBadge} ${styles[user.role || 'student'] || ''}`}>
                                        <i className={`fas ${roleInfo.icon}`}></i> {roleInfo.text}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.profileEditCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-user-edit"></i> {t('profile.editTitle')}</h3>
                                    <p className={styles.editSubtitle}>{t('profile.editSubtitle')}</p>
                                </div>

                                <form className={`${styles.cardScrollArea} auth-form`} onSubmit={handleFormSubmit}>
                                    <div className={styles.formGroup}>
                                        <label>{t('auth.username')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input type="text" id="username" value={formData.username} onChange={handleInputChange} required />
                                            <i className={`fas fa-user ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>{t('profile.emailAddress')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input type="email" id="email" value={formData.email} onChange={handleInputChange} required />
                                            <i className={`fas fa-envelope ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>{t('profile.currentPassword')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input
                                                type={showCurrentPassword ? 'text' : 'password'}
                                                id="currentPassword"
                                                value={formData.currentPassword}
                                                onChange={handleInputChange}
                                                required
                                                placeholder={t('profile.currentPasswordRequired')}
                                            />
                                            <i className={`fas fa-shield-alt ${styles.inputIcon}`}></i>
                                            <i
                                                className={`fas ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                style={{ cursor: 'pointer' }}
                                            ></i>
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>{t('auth.newPassword')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                id="password"
                                                value={formData.password}
                                                onChange={handleInputChange}
                                                placeholder={t('profile.keepPassword')}
                                            />
                                            <i className={`fas fa-lock ${styles.inputIcon}`}></i>
                                            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                                onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer' }}></i>
                                        </div>
                                    </div>

                                    <button type="submit" className={styles.btnSave} disabled={isLoading}>
                                        {isLoading ? <><i className="fas fa-spinner fa-spin"></i> {t('profile.saving')}</> : <><i className="fas fa-save"></i> {t('profile.saveChanges')}</>}
                                    </button>
                                </form>
                            </div>
                        </div>

                        <div className={`${styles.profileLane} ${styles.profileLaneCourses}`}>
                            <div className={styles.profileCoursesCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-book-open"></i> {courseTitle}</h3>
                                    <p className={styles.editSubtitle}>{courseSubtitle}</p>
                                </div>

                                <div className={styles.cardScrollArea}>
                                    {isCoursesLoading ? (
                                        <div className={styles.courseState}>{t('profile.loadingCourses')}</div>
                                    ) : profileCourses?.length ? (
                                        <div className={styles.courseList}>
                                            {profileCourses.map((course) => (
                                                <div className={styles.courseItem} key={course.courseId || course.id}>
                                                    <div className={styles.courseMainInfo}>
                                                        <div className={styles.courseCode}>{course.courseId || course.id}</div>
                                                        <div className={styles.courseName}>{course.name}</div>
                                                    </div>
                                                    <div className={styles.courseMeta}>
                                                        <span>{course.degreeLevel || t('profile.notAvailable')}</span>
                                                        <span>{course.semester || t('profile.notAvailable')}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={styles.courseState}>{t('profile.noCourses')}</div>
                                    )}
                                </div>
                            </div>

                            <div className={styles.profileEditCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-clock"></i> {t('profile.historyTitle')}</h3>
                                    <p className={styles.editSubtitle}>{t('profile.historySubtitle')}</p>
                                </div>

                                <div className={styles.cardScrollArea}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={ttlPermanent}
                                                onChange={(e) => {
                                                    setTtlPermanent(e.target.checked);
                                                    if (e.target.checked) setTtlInput('');
                                                }}
                                            />
                                            {t('profile.keepPermanent')}
                                        </label>
                                    </div>

                                    {!ttlPermanent && (
                                        <div className={styles.formGroup}>
                                            <label>{t('profile.autoDeleteAfter')}</label>
                                            <div className={styles.inputWithIcon}>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={3650}
                                                    value={ttlInput}
                                                    onChange={(e) => setTtlInput(e.target.value)}
                                                    placeholder="90"
                                                />
                                                <i className={`fas fa-calendar-alt ${styles.inputIcon}`}></i>
                                            </div>
                                        </div>
                                    )}

                                    <button className={styles.btnSave} disabled={ttlSaving} onClick={handleSaveHistoryTtl}>
                                        {ttlSaving ? <><i className="fas fa-spinner fa-spin"></i> {t('profile.saving')}</> : <><i className="fas fa-save"></i> {t('profile.saveSetting')}</>}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={`${styles.profileLane} ${styles.profileLaneSingle}`}>
                            <div className={styles.profileEditCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-shield-alt"></i> {t('profile.securityTitle')}</h3>
                                    <p className={styles.editSubtitle}>{t('profile.securitySubtitle')}</p>
                                </div>

                                <div className={styles.cardScrollArea}>
                                    <div className={styles.securitySummary}>
                                        <span>{t('profile.mfaStatus')}</span>
                                        <strong>{securityState?.mfa.enabled ? t('profile.enabled') : t('profile.disabled')}</strong>
                                    </div>

                                    {mfaSecret && (
                                        <div className={styles.securityBox}>
                                            <div className={styles.securityLabel}>{t('profile.mfaSecret')}</div>
                                            <div className={styles.securityValue}>{mfaSecret}</div>
                                            <div className={styles.securityLabel}>{t('profile.mfaUri')}</div>
                                            <div className={styles.securityValue}>{mfaOtpUri}</div>
                                        </div>
                                    )}

                                    {mfaBackupCodes.length > 0 && (
                                        <div className={styles.securityBox}>
                                            <div className={styles.securityLabel}>{t('profile.backupCodes')}</div>
                                            <div className={styles.backupCodeGrid}>
                                                {mfaBackupCodes.map((code) => (
                                                    <code key={code} className={styles.backupCode}>{code}</code>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.formGroup}>
                                        <label>{t('profile.securityPassword')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input value={formData.currentPassword} onChange={(e) => setFormData((prev) => ({ ...prev, currentPassword: e.target.value }))} placeholder={t('profile.currentPasswordRequired')} />
                                            <i className={`fas fa-key ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <button className={styles.btnSave} disabled={securityBusy} onClick={handleStartMfa}>
                                        <i className="fas fa-play"></i> {t('profile.startMfa')}
                                    </button>

                                    <div className={styles.formGroup}>
                                        <label>{t('profile.mfaConfirmCode')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input value={mfaConfirmCode} onChange={(e) => setMfaConfirmCode(e.target.value)} placeholder="123456" />
                                            <i className={`fas fa-fingerprint ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <button className={styles.btnSave} disabled={securityBusy} onClick={handleConfirmMfa}>
                                        <i className="fas fa-check"></i> {t('profile.confirmMfa')}
                                    </button>

                                    <div className={styles.formGroup}>
                                        <label>{t('profile.stepUpCode')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input value={mfaStepUpCode} onChange={(e) => setMfaStepUpCode(e.target.value)} placeholder="123456" />
                                            <i className={`fas fa-unlock-keyhole ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <button className={styles.btnSave} disabled={securityBusy} onClick={handleVerifyStepUp}>
                                        <i className="fas fa-bolt"></i> {t('profile.verifyStepUp')}
                                    </button>

                                    <div className={styles.formGroup}>
                                        <label>{t('profile.mfaDisableCode')}</label>
                                        <div className={styles.inputWithIcon}>
                                            <input value={mfaDisableCode} onChange={(e) => setMfaDisableCode(e.target.value)} placeholder="123456" />
                                            <i className={`fas fa-ban ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <button className={styles.btnSave} disabled={securityBusy} onClick={handleDisableMfa}>
                                        <i className="fas fa-power-off"></i> {t('profile.disableMfa')}
                                    </button>

                                    <button className={styles.btnSave} disabled={securityBusy} onClick={handleRegenerateBackupCodes}>
                                        <i className="fas fa-rotate"></i> {t('profile.regenerateBackupCodes')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={`${styles.profileLane} ${styles.profileLaneSingle}`}>
                            <div className={styles.profileEditCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-laptop"></i> Active Sessions</h3>
                                    <p className={styles.editSubtitle}>Review devices with active refresh access.</p>
                                </div>

                                <div className={styles.cardScrollArea}>
                                    {sessionsLoading ? (
                                        <div className={styles.courseState}>Loading sessions...</div>
                                    ) : authSessions.length ? (
                                        <div className={styles.courseList}>
                                            {authSessions.map((session) => (
                                                <div className={styles.courseItem} key={session.sessionId}>
                                                    <div className={styles.courseMainInfo}>
                                                        <div className={styles.courseCode}>
                                                            {session.current ? 'Current session' : 'Active session'}
                                                        </div>
                                                        <div className={styles.courseName}>
                                                            Last active {formatSessionTime(session.lastSeenAt)}
                                                        </div>
                                                    </div>
                                                    <div className={styles.courseMeta}>
                                                        <span>Created {formatSessionTime(session.createdAt)}</span>
                                                        <span>Refresh expires {formatSessionTime(session.expiresAt)}</span>
                                                    </div>
                                                    {!session.current && (
                                                        <button
                                                            type="button"
                                                            className={styles.btnModal}
                                                            disabled={revokingSessionId === session.sessionId}
                                                            onClick={() => handleRevokeSession(session.sessionId)}
                                                        >
                                                            {revokingSessionId === session.sessionId ? 'Revoking...' : 'Revoke'}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={styles.courseState}>No active sessions found.</div>
                                    )}

                                    <button className={styles.btnSave} disabled={loggingOutAll} onClick={handleLogoutAll}>
                                        {loggingOutAll ? <><i className="fas fa-spinner fa-spin"></i> Signing out...</> : <><i className="fas fa-power-off"></i> Sign out all sessions</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showModal && (
                <div className={`${styles.modalOverlay} ${styles.active}`} onClick={(e: any) => e.target.classList.contains('modal-overlay') && setShowModal(false)}>
                    <div className={styles.modalBox}>
                        <div className={styles.modalIcon}><i className="fas fa-exclamation-triangle"></i></div>
                        <h3>{t('profile.confirmTitle')}</h3>
                        <p>{t('profile.confirmBody')}</p>
                        <div className={styles.modalActions}>
                            <button className={`${styles.btnModal} ${styles.btnCancel}`} onClick={() => setShowModal(false)}>{t('profile.cancel')}</button>
                            <button className={`${styles.btnModal} ${styles.btnConfirm}`} onClick={handleSaveProfile}>{t('profile.confirmUpdate')}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
