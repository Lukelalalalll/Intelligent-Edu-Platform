import { useCallback, useEffect, useState } from 'react';

import toast from 'react-hot-toast';

import client from '@/shared/api/client';

import type { ProfileTranslator } from '../components/profile/types';
import { parseHistoryTtlInput } from '../utils/profileHelpers';

export function useProfileHistorySettings({ t }: { t: ProfileTranslator }) {
    const [historyTtlDays, setHistoryTtlDays] = useState(90);
    const [ttlInput, setTtlInput] = useState('90');
    const [ttlPermanent, setTtlPermanent] = useState(false);
    const [ttlSaving, setTtlSaving] = useState(false);

    const loadHistorySettings = useCallback(async (isMounted?: () => boolean) => {
        try {
            const response = await client.get('/profile/history-settings');
            if (isMounted && !isMounted()) {
                return;
            }

            const days = response.data?.history_ttl_days ?? 90;
            setHistoryTtlDays(days);
            setTtlInput(days === 0 ? '' : String(days));
            setTtlPermanent(days === 0);
        } catch {
            // Keep the current optimistic defaults when the request fails.
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        void loadHistorySettings(() => isMounted);

        return () => {
            isMounted = false;
        };
    }, [loadHistorySettings]);

    const setPermanentSelection = useCallback((checked: boolean) => {
        setTtlPermanent(checked);
        if (checked) {
            setTtlInput('');
        }
    }, []);

    const handleSaveHistoryTtl = useCallback(async () => {
        const { days, isValid } = parseHistoryTtlInput(ttlInput, ttlPermanent);
        if (!isValid) {
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
    }, [t, ttlInput, ttlPermanent]);

    return {
        historyTtlDays,
        ttlInput,
        ttlPermanent,
        ttlSaving,
        setTtlInput,
        setPermanentSelection,
        handleSaveHistoryTtl,
    };
}
