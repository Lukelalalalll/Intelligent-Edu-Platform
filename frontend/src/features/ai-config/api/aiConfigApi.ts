import client from '@/shared/api/client';

export interface DeepSeekConfig {
    base_url: string;
    api_key: string;
    api_key_set: boolean;
    model: string;
    stream: boolean;
    reasoning_effort: 'low' | 'medium' | 'high';
    thinking_type: 'enabled' | 'disabled';
    updated_at?: string | null;
}

export interface OpenAIConfig {
    base_url: string;
    api_key: string;
    api_key_set: boolean;
    model: string;
    stream: boolean;
    updated_at?: string | null;
}

export interface AIConfigResponse {
    deepseek: DeepSeekConfig;
    openai: OpenAIConfig;
}

export type DeepSeekConfigUpdate = Omit<DeepSeekConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export type OpenAIConfigUpdate = Omit<OpenAIConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
    base_url: 'https://api.deepseek.com',
    api_key: '',
    api_key_set: false,
    model: 'deepseek-v4-pro',
    stream: false,
    reasoning_effort: 'high',
    thinking_type: 'enabled',
    updated_at: null,
};

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    api_key_set: false,
    model: 'gpt-5.5',
    stream: false,
    updated_at: null,
};

export const aiConfigApi = {
    get: (): Promise<AIConfigResponse> =>
        client.get('/profile/ai-config').then((response) => response.data),

    updateDeepSeek: (payload: DeepSeekConfigUpdate): Promise<{ deepseek: DeepSeekConfig }> =>
        client.post('/profile/ai-config/deepseek', payload).then((response) => response.data),

    updateOpenAI: (payload: OpenAIConfigUpdate): Promise<{ openai: OpenAIConfig }> =>
        client.post('/profile/ai-config/openai', payload).then((response) => response.data),
};
