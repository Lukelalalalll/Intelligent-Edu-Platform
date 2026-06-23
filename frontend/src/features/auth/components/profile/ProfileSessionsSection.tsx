import styles from '../../styles/profile.module.css';
import {
    formatSessionBrowser,
    formatSessionDeviceLabel,
    formatSessionDeviceType,
    formatSessionOs,
    formatSessionTime,
} from '../../utils/profileHelpers';
import type { AuthSessionItem, ProfileTranslator } from './types';

interface ProfileSessionsSectionProps {
    authSessions: AuthSessionItem[];
    sessionsLoading: boolean;
    revokingSessionId: string;
    loggingOutAll: boolean;
    t: ProfileTranslator;
    onRevokeSession: (sessionId: string) => void;
    onLogoutAll: () => void;
}

export function ProfileSessionsSection({
    authSessions,
    sessionsLoading,
    revokingSessionId,
    loggingOutAll,
    t,
    onRevokeSession,
    onLogoutAll,
}: ProfileSessionsSectionProps) {
    return (
        <div className={styles.profileEditCard}>
            <div className={styles.cardHeader}>
                <h3><i className="fas fa-laptop"></i> {t('profile.sessionsTitle')}</h3>
                <p className={styles.editSubtitle}>{t('profile.sessionsSubtitle')}</p>
            </div>

            <div className={styles.cardScrollArea}>
                {sessionsLoading ? (
                    <div className={styles.courseState}>{t('profile.sessionsLoading')}</div>
                ) : authSessions.length ? (
                    <div className={styles.courseList}>
                        {authSessions.map((session) => (
                            <div className={styles.courseItem} key={session.sessionId}>
                                <div className={styles.courseMainInfo}>
                                    <div className={styles.courseCode}>
                                        {session.current ? t('profile.sessionsCurrent') : t('profile.sessionsActive')}
                                    </div>
                                    <div className={styles.courseName}>{formatSessionDeviceLabel(session, t)}</div>
                                </div>
                                <div className={styles.courseMeta}>
                                    <span>{formatSessionOs(session.os, t)}</span>
                                    <span>{formatSessionDeviceType(session.deviceType, t)}</span>
                                    <span>{formatSessionBrowser(session.browser, t)}</span>
                                    {session.ipLabel ? <span>{session.ipLabel}</span> : null}
                                    <span>{t('profile.sessionsLastActive', { time: formatSessionTime(session.lastSeenAt, t) })}</span>
                                    <span>{t('profile.sessionsCreated', { time: formatSessionTime(session.createdAt, t) })}</span>
                                    <span>{t('profile.sessionsExpires', { time: formatSessionTime(session.expiresAt, t) })}</span>
                                </div>
                                {!session.current && (
                                    <button
                                        type="button"
                                        className={styles.btnModal}
                                        disabled={revokingSessionId === session.sessionId}
                                        onClick={() => onRevokeSession(session.sessionId)}
                                    >
                                        {revokingSessionId === session.sessionId
                                            ? t('profile.sessionsRevoking')
                                            : t('profile.sessionsRevoke')}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.courseState}>{t('profile.sessionsEmpty')}</div>
                )}

                <button type="button" className={styles.btnSave} disabled={loggingOutAll} onClick={onLogoutAll}>
                    {loggingOutAll
                        ? <><i className="fas fa-spinner fa-spin"></i> {t('profile.sessionsSigningOut')}</>
                        : <><i className="fas fa-power-off"></i> {t('profile.sessionsSignOutAll')}</>}
                </button>
            </div>
        </div>
    );
}
