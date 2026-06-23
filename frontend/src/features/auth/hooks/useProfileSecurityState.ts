import { useCallback, useEffect, useState } from 'react';

import toast from 'react-hot-toast';

import client from '@/shared/api/client';

import type { ProfileTranslator, SecurityState } from '../components/profile/types';
import { resolveApiErrorMessage } from '../utils/profileHelpers';

interface UseProfileSecurityStateArgs {
    currentPassword: string;
    t: ProfileTranslator;
}

export function useProfileSecurityState({ currentPassword, t }: UseProfileSecurityStateArgs) {
    const [securityState, setSecurityState] = useState<SecurityState | null>(null);
    const [mfaConfirmCode, setMfaConfirmCode] = useState('');
    const [mfaDisableCode, setMfaDisableCode] = useState('');
    const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
    const [mfaSecret, setMfaSecret] = useState('');
    const [mfaOtpUri, setMfaOtpUri] = useState('');
    const [mfaStepUpCode, setMfaStepUpCode] = useState('');
    const [securityBusy, setSecurityBusy] = useState(false);

    const loadSecurityState = useCallback(async () => {
        try {
            const response = await client.get('/profile/security');
            setSecurityState(response.data);
        } catch {
            setSecurityState(null);
        }
    }, []);

    useEffect(() => {
        void loadSecurityState();
    }, [loadSecurityState]);

    const handleStartMfa = useCallback(async () => {
        if (!currentPassword.trim()) {
            toast.error(t('profile.securityPasswordRequired'));
            return;
        }

        setSecurityBusy(true);
        try {
            const response = await client.post('/profile/security/mfa/start', {
                current_password: currentPassword,
            });
            setMfaSecret(response.data?.secret || '');
            setMfaOtpUri(response.data?.otpauthUri || '');
            await loadSecurityState();
            toast.success(t('profile.mfaStarted'));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.updateFailed')));
        } finally {
            setSecurityBusy(false);
        }
    }, [currentPassword, loadSecurityState, t]);

    const handleConfirmMfa = useCallback(async () => {
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
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.updateFailed')));
        } finally {
            setSecurityBusy(false);
        }
    }, [loadSecurityState, mfaConfirmCode, t]);

    const handleDisableMfa = useCallback(async () => {
        if (!mfaDisableCode.trim()) {
            toast.error(t('profile.mfaCodeRequired'));
            return;
        }

        setSecurityBusy(true);
        try {
            await client.post('/profile/security/mfa/disable', {
                current_password: currentPassword,
                code: mfaDisableCode,
            });
            setMfaDisableCode('');
            setMfaBackupCodes([]);
            await loadSecurityState();
            toast.success(t('profile.mfaDisabled'));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.updateFailed')));
        } finally {
            setSecurityBusy(false);
        }
    }, [currentPassword, loadSecurityState, mfaDisableCode, t]);

    const handleRegenerateBackupCodes = useCallback(async () => {
        if (!currentPassword.trim()) {
            toast.error(t('profile.securityPasswordRequired'));
            return;
        }

        setSecurityBusy(true);
        try {
            const response = await client.post('/profile/security/mfa/backup-codes/regenerate', {
                current_password: currentPassword,
            });
            setMfaBackupCodes(Array.isArray(response.data?.backupCodes) ? response.data.backupCodes : []);
            await loadSecurityState();
            toast.success(t('profile.backupCodesUpdated'));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.updateFailed')));
        } finally {
            setSecurityBusy(false);
        }
    }, [currentPassword, loadSecurityState, t]);

    const handleVerifyStepUp = useCallback(async () => {
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
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.updateFailed')));
        } finally {
            setSecurityBusy(false);
        }
    }, [loadSecurityState, mfaStepUpCode, t]);

    return {
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
    };
}
