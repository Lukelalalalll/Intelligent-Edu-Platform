import type { FormEvent } from 'react';

import type { User } from '@/shared/store/useAuthStore';

import styles from '../../styles/profile.module.css';
import type { ProfileFormData, ProfileTranslator, RoleInfo } from './types';

interface ProfileIdentitySectionProps {
    user: User;
    roleInfo: RoleInfo;
    formData: ProfileFormData;
    showCurrentPassword: boolean;
    showPassword: boolean;
    isLoading: boolean;
    t: ProfileTranslator;
    onFieldChange: <K extends keyof ProfileFormData>(field: K, value: ProfileFormData[K]) => void;
    onToggleCurrentPassword: () => void;
    onTogglePassword: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ProfileIdentitySection({
    user,
    roleInfo,
    formData,
    showCurrentPassword,
    showPassword,
    isLoading,
    t,
    onFieldChange,
    onToggleCurrentPassword,
    onTogglePassword,
    onSubmit,
}: ProfileIdentitySectionProps) {
    return (
        <>
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

                <form className={`${styles.cardScrollArea} auth-form`} onSubmit={onSubmit}>
                    <div className={styles.formGroup}>
                        <label>{t('auth.username')}</label>
                        <div className={styles.inputWithIcon}>
                            <input
                                type="text"
                                id="username"
                                value={formData.username}
                                onChange={(event) => onFieldChange('username', event.target.value)}
                                required
                            />
                            <i className={`fas fa-user ${styles.inputIcon}`}></i>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label>{t('profile.emailAddress')}</label>
                        <div className={styles.inputWithIcon}>
                            <input
                                type="email"
                                id="email"
                                value={formData.email}
                                onChange={(event) => onFieldChange('email', event.target.value)}
                                required
                            />
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
                                onChange={(event) => onFieldChange('currentPassword', event.target.value)}
                                required
                                placeholder={t('profile.currentPasswordRequired')}
                            />
                            <i className={`fas fa-shield-alt ${styles.inputIcon}`}></i>
                            <i
                                className={`fas ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                onClick={onToggleCurrentPassword}
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
                                onChange={(event) => onFieldChange('password', event.target.value)}
                                placeholder={t('profile.keepPassword')}
                            />
                            <i className={`fas fa-lock ${styles.inputIcon}`}></i>
                            <i
                                className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                onClick={onTogglePassword}
                                style={{ cursor: 'pointer' }}
                            ></i>
                        </div>
                    </div>

                    <button type="submit" className={styles.btnSave} disabled={isLoading}>
                        {isLoading
                            ? <><i className="fas fa-spinner fa-spin"></i> {t('profile.saving')}</>
                            : <><i className="fas fa-save"></i> {t('profile.saveChanges')}</>}
                    </button>
                </form>
            </div>
        </>
    );
}
