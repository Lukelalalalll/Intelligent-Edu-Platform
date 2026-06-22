import type {
    DeepSeekConfig,
    DeepSeekConfigUpdate,
    OpenAIConfig,
    OpenAIConfigUpdate,
} from '../api/aiConfigApi';

export type ProviderId = 'deepseek' | 'openai';
export type SlideDirection = 'left' | 'right';
export type DeepSeekField = keyof DeepSeekConfig;
export type OpenAIField = keyof OpenAIConfig;

export const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string; icon: string }> = [
    { id: 'deepseek', label: 'DeepSeek', icon: 'fa-brain' },
    { id: 'openai', label: 'OpenAI', icon: 'fa-magic' },
];

export const DEEPSEEK_MODEL_OPTIONS = [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-chat',
    'deepseek-reasoner',
];

export const OPENAI_MODEL_OPTIONS = [
    'gpt-5.5',
    'gpt-5.5-mini',
    'gpt-4.1',
    'gpt-4o',
];

export function normalizeDeepSeekConfig(config: DeepSeekConfig, fallback: DeepSeekConfig): DeepSeekConfig {
    return {
        ...fallback,
        ...config,
        api_key: config?.api_key ?? '',
        api_key_set: Boolean(config?.api_key_set),
    };
}

export function normalizeOpenAIConfig(config: OpenAIConfig, fallback: OpenAIConfig): OpenAIConfig {
    return {
        ...fallback,
        ...config,
        api_key: config?.api_key ?? '',
        api_key_set: Boolean(config?.api_key_set),
    };
}

export function formatUpdatedAt(value?: string | null): string {
    if (!value) return 'Not saved';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Saved';
    return date.toLocaleString();
}

export function buildDeepSeekPayload(form: DeepSeekConfig, clearApiKey = false): DeepSeekConfigUpdate {
    return {
        base_url: form.base_url.trim(),
        api_key: clearApiKey ? '' : form.api_key.trim(),
        clear_api_key: clearApiKey,
        model: form.model.trim(),
        stream: form.stream,
        reasoning_effort: form.reasoning_effort,
        thinking_type: form.thinking_type,
    };
}

export function buildOpenAIPayload(form: OpenAIConfig, clearApiKey = false): OpenAIConfigUpdate {
    return {
        base_url: form.base_url.trim(),
        api_key: clearApiKey ? '' : form.api_key.trim(),
        clear_api_key: clearApiKey,
        model: form.model.trim(),
        stream: form.stream,
    };
}

export function buildProviderPreview(rows: Array<[string, string]>) {
    return rows;
}
