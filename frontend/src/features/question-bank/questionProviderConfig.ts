import type { AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';

export type QuestionStudioProvider = 'openai' | 'deepseek' | 'bigmodel';

const STORAGE_KEY = 'question_studio_provider';

function isProvider(value: unknown): value is QuestionStudioProvider {
    return value === 'openai' || value === 'deepseek' || value === 'bigmodel';
}

export function getConfiguredQuestionProviders(
    aiConfig: AIConfigResponse | null | undefined,
): QuestionStudioProvider[] {
    const providers: QuestionStudioProvider[] = [];
    if (aiConfig?.text?.openai?.api_key_set) providers.push('openai');
    if (aiConfig?.text?.deepseek?.api_key_set) providers.push('deepseek');
    if (aiConfig?.text?.bigmodel?.api_key_set) providers.push('bigmodel');
    return providers;
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

export function resolveQuestionProvider(
    aiConfig: AIConfigResponse | null | undefined,
): QuestionStudioProvider | null {
    const configured = getConfiguredQuestionProviders(aiConfig);
    if (!configured.length) return null;
    const stored = readStoredQuestionProvider();
    if (stored && configured.includes(stored)) return stored;
    const fallback = configured[0];
    writeStoredQuestionProvider(fallback);
    return fallback;
}
