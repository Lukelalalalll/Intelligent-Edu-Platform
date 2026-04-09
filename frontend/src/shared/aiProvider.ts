export type AIProvider = 'coze' | 'local_ollama';

const AI_PROVIDER_STORAGE_KEY = 'ai_provider';

export function getStoredAIProvider(): AIProvider {
    if (typeof window === 'undefined') return 'local_ollama';
    const raw = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    return raw === 'coze' ? 'coze' : 'local_ollama';
}

export function setStoredAIProvider(provider: AIProvider): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
}
