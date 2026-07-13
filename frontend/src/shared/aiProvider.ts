export type AIProvider = 'auto' | 'coze' | 'local_ollama' | 'deepseek' | 'openai' | 'bigmodel';

const AI_PROVIDER_STORAGE_KEY = 'ai_provider';

export function getStoredAIProvider(): AIProvider {
    if (typeof window === 'undefined') return 'local_ollama';
    const raw = (() => {
        try {
            return window.localStorage?.getItem(AI_PROVIDER_STORAGE_KEY) ?? null;
        } catch {
            return null;
        }
    })();
    if (raw === 'local_ollama') return 'local_ollama';
    if (raw === 'coze') return 'coze';
    if (raw === 'deepseek') return 'deepseek';
    if (raw === 'openai') return 'openai';
    if (raw === 'bigmodel') return 'bigmodel';
    return 'local_ollama';
}

export function setStoredAIProvider(provider: AIProvider): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage?.setItem(AI_PROVIDER_STORAGE_KEY, provider);
    } catch {
        // ignore storage write failures
    }
}
