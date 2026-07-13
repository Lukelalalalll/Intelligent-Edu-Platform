import styles from '../../styles/profile.module.css';
import type { ProfileTranslator, SecurityState } from './types';

interface ProfileSecuritySectionProps {
    securityState: SecurityState | null;
    currentPassword: string;
    mfaConfirmCode: string;
    mfaDisableCode: string;
    mfaBackupCodes: string[];
    mfaSecret: string;
    mfaOtpUri: string;
    mfaStepUpCode: string;
    securityBusy: boolean;
    t: ProfileTranslator;
    onCurrentPasswordChange: (value: string) => void;
    onMfaConfirmCodeChange: (value: string) => void;
    onMfaDisableCodeChange: (value: string) => void;
    onMfaStepUpCodeChange: (value: string) => void;
    onStartMfa: () => void;
    onConfirmMfa: () => void;
    onVerifyStepUp: () => void;
    onDisableMfa: () => void;
    onRegenerateBackupCodes: () => void;
}

export function ProfileSecuritySection({
    securityState,
    currentPassword,
    mfaConfirmCode,
    mfaDisableCode,
    mfaBackupCodes,
    mfaSecret,
    mfaOtpUri,
    mfaStepUpCode,
    securityBusy,
    t,
    onCurrentPasswordChange,
    onMfaConfirmCodeChange,
    onMfaDisableCodeChange,
    onMfaStepUpCodeChange,
    onStartMfa,
    onConfirmMfa,
    onVerifyStepUp,
    onDisableMfa,
    onRegenerateBackupCodes,
}: ProfileSecuritySectionProps) {
    return (
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
                        <input
                            value={currentPassword}
                            onChange={(event) => onCurrentPasswordChange(event.target.value)}
                            placeholder={t('profile.currentPasswordRequired')}
                        />
                        <i className={`fas fa-key ${styles.inputIcon}`}></i>
                    </div>
                </div>

                <button type="button" className={styles.btnSave} disabled={securityBusy} onClick={onStartMfa}>
                    <i className="fas fa-play"></i> {t('profile.startMfa')}
                </button>

                <div className={styles.formGroup}>
                    <label>{t('profile.mfaConfirmCode')}</label>
                    <div className={styles.inputWithIcon}>
                        <input value={mfaConfirmCode} onChange={(event) => onMfaConfirmCodeChange(event.target.value)} placeholder="123456" />
                        <i className={`fas fa-fingerprint ${styles.inputIcon}`}></i>
                    </div>
                </div>

                <button type="button" className={styles.btnSave} disabled={securityBusy} onClick={onConfirmMfa}>
                    <i className="fas fa-check"></i> {t('profile.confirmMfa')}
                </button>

                <div className={styles.formGroup}>
                    <label>{t('profile.stepUpCode')}</label>
                    <div className={styles.inputWithIcon}>
                        <input value={mfaStepUpCode} onChange={(event) => onMfaStepUpCodeChange(event.target.value)} placeholder="123456" />
                        <i className={`fas fa-unlock-keyhole ${styles.inputIcon}`}></i>
                    </div>
                </div>

                <button type="button" className={styles.btnSave} disabled={securityBusy} onClick={onVerifyStepUp}>
                    <i className="fas fa-bolt"></i> {t('profile.verifyStepUp')}
                </button>

                <div className={styles.formGroup}>
                    <label>{t('profile.mfaDisableCode')}</label>
                    <div className={styles.inputWithIcon}>
                        <input value={mfaDisableCode} onChange={(event) => onMfaDisableCodeChange(event.target.value)} placeholder="123456" />
                        <i className={`fas fa-ban ${styles.inputIcon}`}></i>
                    </div>
                </div>

                <button type="button" className={styles.btnSave} disabled={securityBusy} onClick={onDisableMfa}>
                    <i className="fas fa-power-off"></i> {t('profile.disableMfa')}
                </button>

                <button type="button" className={styles.btnSave} disabled={securityBusy} onClick={onRegenerateBackupCodes}>
                    <i className="fas fa-rotate"></i> {t('profile.regenerateBackupCodes')}
                </button>
            </div>
        </div>
    );
}
