import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { NavigateFunction } from 'react-router-dom';

import client from '@/shared/api/client';

import type { AuthSessionItem, ProfileTranslator } from '../components/profile/types';
import { resolveApiErrorMessage } from '../utils/profileHelpers';

interface UseProfileSessionsStateArgs {
    logout: () => void;
    navigate: NavigateFunction;
    t: ProfileTranslator;
}

export function useProfileSessionsState({ logout, navigate, t }: UseProfileSessionsStateArgs) {
    const [authSessions, setAuthSessions] = useState<AuthSessionItem[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [revokingSessionId, setRevokingSessionId] = useState('');
    const [loggingOutAll, setLoggingOutAll] = useState(false);

    const loadAuthSessions = useCallback(async (isMounted?: () => boolean) => {
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
    }, []);

    useEffect(() => {
        let isMounted = true;

        void loadAuthSessions(() => isMounted);

        return () => {
            isMounted = false;
        };
    }, [loadAuthSessions]);

    const handleRevokeSession = useCallback(async (sessionId: string) => {
        setRevokingSessionId(sessionId);
        try {
            await client.delete(`/sessions/${sessionId}`);
            setAuthSessions((current) => current.filter((item) => item.sessionId !== sessionId));
            toast.success(t('profile.sessionRevoked'));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.sessionRevokeFailed')));
        } finally {
            setRevokingSessionId('');
        }
    }, [t]);

    const handleLogoutAll = useCallback(async () => {
        setLoggingOutAll(true);
        try {
            await client.post('/logout-all');
            logout();
            toast.success(t('profile.allSessionsSignedOut'));
            setTimeout(() => navigate('/login'), 300);
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.signOutAllFailed')));
        } finally {
            setLoggingOutAll(false);
        }
    }, [logout, navigate, t]);

    return {
        authSessions,
        sessionsLoading,
        revokingSessionId,
        loggingOutAll,
        handleRevokeSession,
        handleLogoutAll,
    };
}
