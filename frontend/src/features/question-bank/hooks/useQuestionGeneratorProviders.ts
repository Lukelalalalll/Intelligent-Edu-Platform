import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Toast } from '@/types/api';

import { listQuestionProviders, type QuestionProviderStatus } from '../api/questionBankApi';
import {
    getPreferredQuestionProviders,
    isAiConfigQuestionProvider,
    isQuestionProviderReady,
    resolveQuestionProvider,
    writeStoredQuestionProvider,
    type QuestionStudioProvider,
} from '../questionProviderConfig';

type ShowToast = (message: string, type: Toast['type']) => void;

export function useQuestionGeneratorProviders(showToast: ShowToast) {
    const [providerOptions, setProviderOptions] = useState<QuestionProviderStatus[]>([]);
    const [provider, setProvider] = useState<QuestionStudioProvider | null>(null);
    const [providerLoading, setProviderLoading] = useState(true);
    const [providerError, setProviderError] = useState('');

    const selectedProviderStatus = useMemo(
        () => providerOptions.find((option) => option.id === provider) || null,
        [provider, providerOptions],
    );
    const preferredProviderOptions = useMemo(
        () => getPreferredQuestionProviders(providerOptions),
        [providerOptions],
    );
    const preferredAiConfigOptions = useMemo(
        () => preferredProviderOptions.filter((option) => isAiConfigQuestionProvider(option)),
        [preferredProviderOptions],
    );

    const loadProviders = useCallback(async () => {
        setProviderLoading(true);
        try {
            setProviderError('');
            const data = await listQuestionProviders();
            const nextOptions = Array.isArray(data.providers) ? data.providers : [];
            setProviderOptions(nextOptions);
            setProvider(resolveQuestionProvider(nextOptions));
        } catch (error) {
            console.error(error);
            setProviderOptions([]);
            setProvider(null);
            setProviderError(error instanceof Error ? error.message : 'Failed to load question providers.');
            showToast('Failed to load question providers.', 'error');
        } finally {
            setProviderLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        void loadProviders();
    }, [loadProviders]);

    useEffect(() => {
        if (!provider) return;
        writeStoredQuestionProvider(provider);
    }, [provider]);

    useEffect(() => {
        if (!providerOptions.length) return;
        const current = providerOptions.find((item) => item.id === provider);
        if (
            current
            && isQuestionProviderReady(current)
            && (preferredAiConfigOptions.length === 0 || preferredProviderOptions.some((item) => item.id === current.id))
        ) {
            return;
        }
        const nextProvider = resolveQuestionProvider(providerOptions);
        if (nextProvider) {
            setProvider(nextProvider);
        }
    }, [preferredAiConfigOptions.length, preferredProviderOptions, provider, providerOptions]);

    return {
        providerOptions,
        provider,
        setProvider,
        providerLoading,
        providerError,
        selectedProviderStatus,
        preferredProviderOptions,
        preferredAiConfigOptions,
        loadProviders,
    };
}
