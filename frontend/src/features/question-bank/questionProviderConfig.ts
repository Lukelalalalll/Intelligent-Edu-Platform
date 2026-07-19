import type { AIProvider } from '@/shared/aiProvider';

import type { QuestionProviderStatus } from './api/questionBankApi';

export type QuestionStudioProvider = AIProvider;

const STORAGE_KEY = 'question_studio_provider';

function isProvider(value: unknown): value is QuestionStudioProvider {
    return value === 'auto'
        || value === 'coze'
        || value === 'local_ollama'
        || value === 'deepseek'
        || value === 'openai'
        || value === 'bigmodel';
}

export function readStoredQuestionProvider(): QuestionStudioProvider | null {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return isProvider(value) ? value : null;
    } catch {
        return null;
    }
}

export function writeStoredQuestionProvider(provider: QuestionStudioProvider): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, provider);
    } catch {
        // ignore storage write failures
    }
}

export function isQuestionProviderReady(option: QuestionProviderStatus | null | undefined): boolean {
    return Boolean(option?.configured && option?.available);
}

export function isAiConfigQuestionProvider(option: QuestionProviderStatus | null | undefined): boolean {
    return option?.source === 'user_ai_config';
}

export function getPreferredQuestionProviders(
    options: QuestionProviderStatus[] | null | undefined,
): QuestionProviderStatus[] {
    const normalized = Array.isArray(options) ? options : [];
    const ready = normalized.filter((item) => isQuestionProviderReady(item));
    const readyAiConfig = ready.filter((item) => isAiConfigQuestionProvider(item));
    return readyAiConfig.length > 0 ? readyAiConfig : ready;
}

export function getReadyAiConfigQuestionProviders(
    options: QuestionProviderStatus[] | null | undefined,
): QuestionProviderStatus[] {
    const normalized = Array.isArray(options) ? options : [];
    return normalized.filter((item) => isQuestionProviderReady(item) && isAiConfigQuestionProvider(item));
}

export function resolveQuestionAiConfigProvider(
    options: QuestionProviderStatus[] | null | undefined,
): QuestionStudioProvider | null {
    const normalized = getReadyAiConfigQuestionProviders(options);
    if (!normalized.length) return null;

    const stored = readStoredQuestionProvider();
    const storedOption = stored
        ? normalized.find((item) => item.id === stored)
        : null;
    if (storedOption) return storedOption.id;

    const recommended = normalized.find((item) => item.is_recommended);
    if (recommended) return recommended.id;

    return normalized[0]?.id || null;
}

export function resolveQuestionProvider(
    options: QuestionProviderStatus[] | null | undefined,
): QuestionStudioProvider | null {
    const normalized = Array.isArray(options) ? options : [];
    if (!normalized.length) return null;

    const preferred = getPreferredQuestionProviders(normalized);
    const readyAiConfig = preferred.filter((item) => isAiConfigQuestionProvider(item));

    const stored = readStoredQuestionProvider();
    const storedOption = stored
        ? normalized.find((item) => item.id === stored && isQuestionProviderReady(item))
        : null;
    if (storedOption && (storedOption.id !== 'auto' || readyAiConfig.length === 0)) return storedOption.id;

    if (readyAiConfig.length > 0) return readyAiConfig[0].id;

    const recommended = normalized.find((item) => item.is_recommended && isQuestionProviderReady(item));
    if (recommended) return recommended.id;

    const firstReady = preferred[0] || normalized.find((item) => isQuestionProviderReady(item));
    if (firstReady) return firstReady.id;

    return normalized[0]?.id || null;
}

export function formatQuestionProviderSource(source: string): string {
    if (source === 'user_ai_config') return 'AI Config';
    if (source === 'env_default' || source === 'global_service') return 'Server default';
    if (source === 'auto' || source === 'auto_fallback') return 'Automatic';
    return source || 'Unknown source';
}
