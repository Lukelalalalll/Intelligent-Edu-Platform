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

export type ClaudeConfig = OpenAIConfig;
export type MultimodalOpenAIConfig = OpenAIConfig;
export type MultimodalClaudeConfig = ClaudeConfig;

export interface BigModelConfig {
    base_url: string;
    api_key: string;
    api_key_set: boolean;
    text_model: string;
    image_model: string;
    stream: boolean;
    updated_at?: string | null;
}

export interface MiniMaxConfig {
    base_url: string;
    image_base_url: string;
    api_key: string;
    api_key_set: boolean;
    text_model: string;
    multimodal_model: string;
    image_model: string;
    stream: boolean;
    updated_at?: string | null;
}

export type BigModelTextRuntimeConfig = OpenAIConfig;
export type BigModelMultimodalRuntimeConfig = OpenAIConfig;
export type MiniMaxTextRuntimeConfig = OpenAIConfig;
export type MiniMaxMultimodalRuntimeConfig = OpenAIConfig;
export type MiniMaxImageRuntimeConfig = OpenAIConfig;

export interface AIConfigTextGroup {
    deepseek: DeepSeekConfig;
    openai: OpenAIConfig;
    claude: ClaudeConfig;
    bigmodel: BigModelTextRuntimeConfig;
    minimax: MiniMaxTextRuntimeConfig;
}

export interface AIConfigMultimodalGroup {
    openai: MultimodalOpenAIConfig;
    claude: MultimodalClaudeConfig;
    bigmodel: BigModelMultimodalRuntimeConfig;
    minimax: MiniMaxMultimodalRuntimeConfig;
}

export interface AIConfigImageGroup {
    minimax: MiniMaxImageRuntimeConfig;
}

export interface AIConfigResponse {
    deepseek: DeepSeekConfig;
    openai: OpenAIConfig;
    claude: ClaudeConfig;
    bigmodel: BigModelConfig;
    minimax: MiniMaxConfig;
    text: AIConfigTextGroup;
    multimodal: AIConfigMultimodalGroup;
    image: AIConfigImageGroup;
}

export type DeepSeekConfigUpdate = Omit<DeepSeekConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export type OpenAIConfigUpdate = Omit<OpenAIConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export type ClaudeConfigUpdate = Omit<ClaudeConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export type MultimodalOpenAIConfigUpdate = Omit<MultimodalOpenAIConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export type BigModelConfigUpdate = Omit<BigModelConfig, 'api_key_set' | 'updated_at'> & {
    clear_api_key?: boolean;
};

export type MiniMaxConfigUpdate = Omit<MiniMaxConfig, 'api_key_set' | 'updated_at'> & {
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
    model: 'gpt-5.6',
    stream: false,
    updated_at: null,
};

export const DEFAULT_CLAUDE_CONFIG: ClaudeConfig = {
    base_url: 'https://api.anthropic.com/v1',
    api_key: '',
    api_key_set: false,
    model: 'claude-sonnet-5',
    stream: false,
    updated_at: null,
};

export const DEFAULT_MULTIMODAL_OPENAI_CONFIG: MultimodalOpenAIConfig = {
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    api_key_set: false,
    model: 'gpt-5.6',
    stream: false,
    updated_at: null,
};

export const DEFAULT_BIGMODEL_CONFIG: BigModelConfig = {
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    api_key: '',
    api_key_set: false,
    text_model: 'glm-4.5-flash',
    image_model: 'glm-5v-flash',
    stream: false,
    updated_at: null,
};

export const DEFAULT_MINIMAX_CONFIG: MiniMaxConfig = {
    base_url: 'https://api.minimaxi.com/v1',
    image_base_url: 'https://api.minimaxi.com/v1',
    api_key: '',
    api_key_set: false,
    text_model: 'MiniMax-M2.7',
    multimodal_model: 'MiniMax-M3',
    image_model: 'image-01',
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

    updateClaude: (payload: ClaudeConfigUpdate): Promise<{ claude: ClaudeConfig }> =>
        client.post('/profile/ai-config/claude', payload).then((response) => response.data),

    updateMultimodalOpenAI: (payload: MultimodalOpenAIConfigUpdate): Promise<{ openai: MultimodalOpenAIConfig }> =>
        client.post('/profile/ai-config/multimodal/openai', payload).then((response) => response.data),

    updateBigModel: (payload: BigModelConfigUpdate): Promise<{ bigmodel: BigModelConfig }> =>
        client.post('/profile/ai-config/bigmodel', payload).then((response) => response.data),

    updateMiniMax: (payload: MiniMaxConfigUpdate): Promise<{ minimax: MiniMaxConfig }> =>
        client.post('/profile/ai-config/minimax', payload).then((response) => response.data),
};
