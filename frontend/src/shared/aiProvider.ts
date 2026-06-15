export type AIProvider = 'auto' | 'coze' | 'local_ollama' | 'deepseek' | 'openai';

const AI_PROVIDER_STORAGE_KEY = 'ai_provider';

export function getStoredAIProvider(): AIProvider {
    if (typeof window === 'undefined') return 'local_ollama';
    const raw = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    if (raw === 'local_ollama') return 'local_ollama';
    if (raw === 'coze') return 'coze';
    if (raw === 'deepseek') return 'deepseek';
    if (raw === 'openai') return 'openai';
    return 'local_ollama';
}

export function setStoredAIProvider(provider: AIProvider): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
}
