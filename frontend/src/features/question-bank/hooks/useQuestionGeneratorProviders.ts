import { useCallback, useEffect, useMemo, useState } from 'react';

import { aiConfigApi, type AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';

import type { QuestionProviderStatus } from '../api/questionBankApi';
import {
    getPreferredQuestionProviders,
    isAiConfigQuestionProvider,
    isQuestionProviderReady,
    resolveQuestionAiConfigProvider,
    writeStoredQuestionProvider,
    type QuestionStudioProvider,
} from '../questionProviderConfig';
import { getQuestionRequestErrorMessage } from '../utils/requestError';

type AiConfigTextProvider = Extract<QuestionStudioProvider, 'openai' | 'claude' | 'deepseek' | 'bigmodel' | 'minimax'>;

const TEXT_PROVIDER_META: Record<AiConfigTextProvider, { label: string; order: number }> = {
    openai: { label: 'OpenAI', order: 0 },
    claude: { label: 'Claude', order: 1 },
    bigmodel: { label: 'BigModel / GLM', order: 2 },
    minimax: { label: 'MiniMax', order: 3 },
    deepseek: { label: 'DeepSeek', order: 4 },
};

function buildAiConfigTextProviders(config: AIConfigResponse): QuestionProviderStatus[] {
    const rows: Array<{
        id: AiConfigTextProvider;
        model: string;
        configured: boolean;
        updatedAt?: string | null;
    }> = [
        {
            id: 'openai',
            model: config.text.openai.model,
            configured: config.text.openai.api_key_set,
            updatedAt: config.text.openai.updated_at,
        },
        {
            id: 'claude',
            model: config.text.claude.model,
            configured: config.text.claude.api_key_set,
            updatedAt: config.text.claude.updated_at,
        },
        {
            id: 'bigmodel',
            model: config.text.bigmodel.model,
            configured: config.text.bigmodel.api_key_set,
            updatedAt: config.text.bigmodel.updated_at,
        },
        {
            id: 'minimax',
            model: config.text.minimax.model,
            configured: config.text.minimax.api_key_set,
            updatedAt: config.text.minimax.updated_at,
        },
        {
            id: 'deepseek',
            model: config.text.deepseek.model,
            configured: config.text.deepseek.api_key_set,
            updatedAt: config.text.deepseek.updated_at,
        },
    ];

    const readyRows = rows
        .map((row) => ({ ...row, model: String(row.model || '').trim() }))
        .filter((row) => row.configured && row.model)
        .sort((a, b) => TEXT_PROVIDER_META[a.id].order - TEXT_PROVIDER_META[b.id].order);

    return readyRows.map((row, index) => ({
        id: row.id,
        label: TEXT_PROVIDER_META[row.id].label,
        available: true,
        configured: true,
        source: 'user_ai_config',
        model: row.model,
        message: row.updatedAt
            ? `Configured in AI Config. Last updated ${new Date(row.updatedAt).toLocaleString()}.`
            : 'Configured in AI Config and ready for text generation.',
        is_recommended: index === 0,
    }));
}

function getAiConfigLoadErrorMessage(error: unknown): string {
    return getQuestionRequestErrorMessage(
        error,
        'Unable to load AI Config text models. Open AI Config and confirm your saved provider settings.',
    );
}

export function useQuestionGeneratorProviders() {
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
            const data = await aiConfigApi.get();
            const nextOptions = buildAiConfigTextProviders(data);
            setProviderOptions(nextOptions);
            setProvider(resolveQuestionAiConfigProvider(nextOptions));
        } catch (error) {
            console.error(error);
            setProviderOptions([]);
            setProvider(null);
            setProviderError(getAiConfigLoadErrorMessage(error));
        } finally {
            setProviderLoading(false);
        }
    }, []);

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
            && (preferredAiConfigOptions.length === 0 || preferredAiConfigOptions.some((item) => item.id === current.id))
        ) {
            return;
        }
        const nextProvider = resolveQuestionAiConfigProvider(providerOptions);
        setProvider(nextProvider);
    }, [preferredAiConfigOptions, provider, providerOptions]);

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
