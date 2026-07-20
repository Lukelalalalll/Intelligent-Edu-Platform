import type { AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';

import type { AIProvider } from '../api/aiApi';

export interface ChatModelOption {
    provider: Extract<AIProvider, 'deepseek' | 'openai' | 'claude' | 'bigmodel' | 'minimax' | 'local_ollama'>;
    modelLabel: string;
    providerLabel: string;
    source: 'ai_config' | 'fallback';
}

export const LOCAL_OLLAMA_FALLBACK_OPTION: ChatModelOption = {
    provider: 'local_ollama',
    modelLabel: 'Local Ollama',
    providerLabel: 'Local Runtime',
    source: 'fallback',
};

export function buildConfiguredChatModelOptions(config: AIConfigResponse | null | undefined): ChatModelOption[] {
    if (!config) {
        return [];
    }

    const options: ChatModelOption[] = [];

    if (config.text.deepseek.api_key_set && config.text.deepseek.model.trim()) {
        options.push({
            provider: 'deepseek',
            modelLabel: config.text.deepseek.model.trim(),
            providerLabel: 'DeepSeek',
            source: 'ai_config',
        });
    }

    if (config.text.openai.api_key_set && config.text.openai.model.trim()) {
        options.push({
            provider: 'openai',
            modelLabel: config.text.openai.model.trim(),
            providerLabel: 'OpenAI',
            source: 'ai_config',
        });
    }

    if (config.text.claude.api_key_set && config.text.claude.model.trim()) {
        options.push({
            provider: 'claude',
            modelLabel: config.text.claude.model.trim(),
            providerLabel: 'Claude',
            source: 'ai_config',
        });
    }

    if (config.text.bigmodel.api_key_set && config.text.bigmodel.model.trim()) {
        options.push({
            provider: 'bigmodel',
            modelLabel: config.text.bigmodel.model.trim(),
            providerLabel: 'BigModel / GLM',
            source: 'ai_config',
        });
    }

    if (config.text.minimax.api_key_set && config.text.minimax.model.trim()) {
        options.push({
            provider: 'minimax',
            modelLabel: config.text.minimax.model.trim(),
            providerLabel: 'MiniMax',
            source: 'ai_config',
        });
    }

    return options;
}

export function getSelectedChatModelOption(
    selectedProvider: AIProvider,
    configuredOptions: ChatModelOption[],
): ChatModelOption {
    return configuredOptions.find((option) => option.provider === selectedProvider)
        ?? configuredOptions[0]
        ?? LOCAL_OLLAMA_FALLBACK_OPTION;
}
