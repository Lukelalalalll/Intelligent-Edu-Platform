export type AIProvider = 'auto' | 'coze' | 'local_ollama' | 'deepseek' | 'openai' | 'claude' | 'bigmodel' | 'minimax';

const AI_PROVIDER_STORAGE_KEY = 'ai_provider';

type StoredAIProviderOptions = {
    allowAuto?: boolean;
};

export function getStoredAIProvider(defaultProvider: AIProvider = 'local_ollama', options: StoredAIProviderOptions = {}): AIProvider {
    if (typeof window === 'undefined') return defaultProvider;
    const raw = (() => {
        try {
            return window.localStorage?.getItem(AI_PROVIDER_STORAGE_KEY) ?? null;
        } catch {
            return null;
        }
    })();
    if (raw === 'auto') return options.allowAuto ? 'auto' : defaultProvider;
    if (raw === 'local_ollama') return 'local_ollama';
    if (raw === 'coze') return 'coze';
    if (raw === 'deepseek') return 'deepseek';
    if (raw === 'openai') return 'openai';
    if (raw === 'claude') return 'claude';
    if (raw === 'bigmodel') return 'bigmodel';
    if (raw === 'minimax') return 'minimax';
    return defaultProvider;
}

export function setStoredAIProvider(provider: AIProvider): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage?.setItem(AI_PROVIDER_STORAGE_KEY, provider);
    } catch {
        // ignore storage write failures
    }
}
