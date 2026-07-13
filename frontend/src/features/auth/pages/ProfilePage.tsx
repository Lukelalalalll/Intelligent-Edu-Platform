import { useNavigate } from 'react-router-dom';

import { useI18n } from '@/shared/i18n';
import { useAuthStore } from '@/shared/store/useAuthStore';

import { ProfileCoursesSection } from '../components/profile/ProfileCoursesSection';
import { ProfileHistorySection } from '../components/profile/ProfileHistorySection';
import { ProfileIdentitySection } from '../components/profile/ProfileIdentitySection';
import { ProfileConnectionsSection } from '../components/profile/ProfileConnectionsSection';
import { ProfileSecuritySection } from '../components/profile/ProfileSecuritySection';
import { ProfileSessionsSection } from '../components/profile/ProfileSessionsSection';
import { ProfileUpdateConfirmModal } from '../components/profile/ProfileUpdateConfirmModal';
import { useProfileCoursesData } from '../hooks/useProfileCoursesData';
import { useProfileFormState } from '../hooks/useProfileFormState';
import { useProfileGoogleBindingState } from '../hooks/useProfileGoogleBindingState';
import { useProfileHistorySettings } from '../hooks/useProfileHistorySettings';
import { useProfileSecurityState } from '../hooks/useProfileSecurityState';
import { useProfileSessionsState } from '../hooks/useProfileSessionsState';
import styles from '../styles/profile.module.css';
import { buildCourseSectionCopy, getRoleInfo } from '../utils/profileHelpers';

export default function ProfilePage() {
    const navigate = useNavigate();
    const { user, updateProfile, logout } = useAuthStore();
    const { t } = useI18n();

    const {
        formData,
        showCurrentPassword,
        showPassword,
        showModal,
        isLoading,
        setFormField,
        setShowModal,
        setShowCurrentPassword,
        setShowPassword,
        handleFormSubmit,
        handleSaveProfile,
    } = useProfileFormState({
        user,
        updateProfile,
        logout,
        navigate,
        t,
    });
    const {
        profileCourses,
        courseSemester,
        isCoursesLoading,
    } = useProfileCoursesData();
    const {
        ttlInput,
        ttlPermanent,
        ttlSaving,
        setTtlInput,
        setPermanentSelection,
        handleSaveHistoryTtl,
    } = useProfileHistorySettings({ t });
    const {
        securityState,
        mfaConfirmCode,
        mfaDisableCode,
        mfaBackupCodes,
        mfaSecret,
        mfaOtpUri,
        mfaStepUpCode,
        securityBusy,
        setMfaConfirmCode,
        setMfaDisableCode,
        setMfaStepUpCode,
        handleStartMfa,
        handleConfirmMfa,
        handleDisableMfa,
        handleRegenerateBackupCodes,
        handleVerifyStepUp,
    } = useProfileSecurityState({
        currentPassword: formData.currentPassword,
        t,
    });
    const {
        googleBinding,
        bindingLoading,
        linkingBusy,
        unlinkingBusy,
        handleBindGoogleCredential,
        handleUnlinkGoogle,
    } = useProfileGoogleBindingState({
        user,
        updateProfile,
        t,
    });
    const {
        authSessions,
        sessionsLoading,
        revokingSessionId,
        loggingOutAll,
        handleRevokeSession,
        handleLogoutAll,
    } = useProfileSessionsState({
        logout,
        navigate,
        t,
    });

    if (!user) {
        return null;
    }

    const roleInfo = getRoleInfo(user.role, t);
    const courseCopy = buildCourseSectionCopy(user.role, courseSemester, t);

    return (
        <>
            <div className={`global-profile-wrapper ${styles.profileWrapper}`}>
                <div className={styles.bgOrb}></div>
                <div className={styles.profileContainer}>
                    <div className={styles.profileRail}>
                        <div className={`${styles.profileLane} ${styles.profileLaneHeader}`}>
                            <ProfileIdentitySection
                                user={user}
                                roleInfo={roleInfo}
                                formData={formData}
                                showCurrentPassword={showCurrentPassword}
                                showPassword={showPassword}
                                isLoading={isLoading}
                                t={t}
                                onFieldChange={setFormField}
                                onToggleCurrentPassword={() => setShowCurrentPassword((current) => !current)}
                                onTogglePassword={() => setShowPassword((current) => !current)}
                                onSubmit={handleFormSubmit}
                            />
                        </div>

                        <div className={`${styles.profileLane} ${styles.profileLaneCourses}`}>
                            <ProfileCoursesSection
                                title={courseCopy.title}
                                subtitle={courseCopy.subtitle}
                                profileCourses={profileCourses}
                                isCoursesLoading={isCoursesLoading}
                                t={t}
                            />
                            <ProfileHistorySection
                                ttlPermanent={ttlPermanent}
                                ttlInput={ttlInput}
                                ttlSaving={ttlSaving}
                                t={t}
                                onPermanentChange={setPermanentSelection}
                                onTtlInputChange={setTtlInput}
                                onSave={handleSaveHistoryTtl}
                            />
                        </div>

                        <div className={`${styles.profileLane} ${styles.profileLaneSecurity}`}>
                            <ProfileSecuritySection
                                securityState={securityState}
                                currentPassword={formData.currentPassword}
                                mfaConfirmCode={mfaConfirmCode}
                                mfaDisableCode={mfaDisableCode}
                                mfaBackupCodes={mfaBackupCodes}
                                mfaSecret={mfaSecret}
                                mfaOtpUri={mfaOtpUri}
                                mfaStepUpCode={mfaStepUpCode}
                                securityBusy={securityBusy}
                                t={t}
                                onCurrentPasswordChange={(value) => setFormField('currentPassword', value)}
                                onMfaConfirmCodeChange={setMfaConfirmCode}
                                onMfaDisableCodeChange={setMfaDisableCode}
                                onMfaStepUpCodeChange={setMfaStepUpCode}
                                onStartMfa={handleStartMfa}
                                onConfirmMfa={handleConfirmMfa}
                                onVerifyStepUp={handleVerifyStepUp}
                                onDisableMfa={handleDisableMfa}
                                onRegenerateBackupCodes={handleRegenerateBackupCodes}
                            />
                            <ProfileConnectionsSection
                                googleBinding={googleBinding}
                                bindingLoading={bindingLoading}
                                linkingBusy={linkingBusy}
                                unlinkingBusy={unlinkingBusy}
                                t={t}
                                onBindGoogleCredential={handleBindGoogleCredential}
                                onUnlinkGoogle={handleUnlinkGoogle}
                            />
                        </div>

                        <div className={`${styles.profileLane} ${styles.profileLaneSingle}`}>
                            <ProfileSessionsSection
                                authSessions={authSessions}
                                sessionsLoading={sessionsLoading}
                                revokingSessionId={revokingSessionId}
                                loggingOutAll={loggingOutAll}
                                t={t}
                                onRevokeSession={handleRevokeSession}
                                onLogoutAll={handleLogoutAll}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <ProfileUpdateConfirmModal
                open={showModal}
                t={t}
                onClose={() => setShowModal(false)}
                onConfirm={handleSaveProfile}
            />
        </>
    );
}
