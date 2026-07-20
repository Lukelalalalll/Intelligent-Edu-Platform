import type {
    BigModelConfig,
    BigModelConfigUpdate,
    DeepSeekConfig,
    DeepSeekConfigUpdate,
    MultimodalOpenAIConfig,
    MultimodalOpenAIConfigUpdate,
    OpenAIConfig,
    OpenAIConfigUpdate,
} from '../api/aiConfigApi';

export type CapabilityId = 'text' | 'multimodal';
export type ProviderId = 'deepseek' | 'openai' | 'bigmodel';
export type SlideDirection = 'left' | 'right';
export type BigModelField = keyof BigModelConfig;
export type DeepSeekField = keyof DeepSeekConfig;
export type OpenAIField = keyof OpenAIConfig;
export type MultimodalOpenAIField = keyof MultimodalOpenAIConfig;
export type BigModelCapability = 'text' | 'multimodal';
export type BigModelModelGroup = 'text' | 'general' | 'vision';

export const CAPABILITY_OPTIONS: Array<{ id: CapabilityId; label: string; icon: string }> = [
    { id: 'text', label: 'Pure Text Models', icon: 'fa-align-left' },
    { id: 'multimodal', label: 'Multimodal Models', icon: 'fa-images' },
];

export const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string; icon: string }> = [
    { id: 'deepseek', label: 'DeepSeek', icon: 'fa-brain' },
    { id: 'openai', label: 'OpenAI', icon: 'fa-magic' },
    { id: 'bigmodel', label: 'BigModel / GLM', icon: 'fa-layer-group' },
];

export const CAPABILITY_PROVIDER_OPTIONS: Record<CapabilityId, Array<{ id: ProviderId; label: string; icon: string }>> = {
    text: PROVIDER_OPTIONS,
    multimodal: [
        { id: 'openai', label: 'OpenAI', icon: 'fa-images' },
        { id: 'bigmodel', label: 'BigModel / GLM', icon: 'fa-layer-group' },
    ],
};

export const DEEPSEEK_MODEL_OPTIONS = [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-chat',
    'deepseek-reasoner',
];

export const OPENAI_MODEL_OPTIONS = [
    'gpt-5.6',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
];

export const MULTIMODAL_OPENAI_MODEL_OPTIONS = [
    'gpt-5.6',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4o-mini',
];

export type BigModelCatalogEntry = {
    id: string;
    label: string;
    group: BigModelModelGroup;
    allowedCapabilities: BigModelCapability[];
};

function buildBigModelCatalogEntries(
    ids: string[],
    group: BigModelModelGroup,
    allowedCapabilities: BigModelCapability[],
): BigModelCatalogEntry[] {
    return ids.map((id) => ({
        id,
        label: id,
        group,
        allowedCapabilities,
    }));
}

export const BIGMODEL_MODEL_CATALOG: BigModelCatalogEntry[] = [
    ...buildBigModelCatalogEntries([
        'glm-4.5-airx',
        'glm-4.5-air',
        'glm-4.5-flash',
        'glm-zero-preview',
        'glm-4.5',
        'glm-4.5-x',
        'glm-z1-air',
        'glm-4-flashx',
        'glm-4-flash',
        'glm-z1-flash',
        'glm-4-plus',
        'glm-4-long',
        'glm-4-air',
        'glm-4-airx',
        'glm-4-alltools',
        'glm-4-plus-fc',
        'glm-4-0520',
        'glm-4',
    ], 'text', ['text']),
    ...buildBigModelCatalogEntries([
        'glm-5v',
        'glm-5v-flash',
        'glm-4.6v',
        'glm-4.6v-flash',
        'glm-4.1v-thinking-flashx',
        'glm-4v-flash',
    ], 'general', ['text', 'multimodal']),
    ...buildBigModelCatalogEntries([
        'glm-z1-visual',
        'glm-z1-rumination',
        'glm-z1-rumination-32b-0414',
    ], 'vision', ['multimodal']),
];

export const BIGMODEL_TEXT_MODEL_OPTIONS = BIGMODEL_MODEL_CATALOG.filter((entry) =>
    entry.allowedCapabilities.includes('text')
);

export const BIGMODEL_IMAGE_MODEL_OPTIONS = BIGMODEL_MODEL_CATALOG.filter((entry) =>
    entry.allowedCapabilities.includes('multimodal')
);

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

export function normalizeMultimodalOpenAIConfig(
    config: MultimodalOpenAIConfig,
    fallback: MultimodalOpenAIConfig,
): MultimodalOpenAIConfig {
    return {
        ...fallback,
        ...config,
        api_key: config?.api_key ?? '',
        api_key_set: Boolean(config?.api_key_set),
    };
}

export function normalizeBigModelConfig(config: BigModelConfig, fallback: BigModelConfig): BigModelConfig {
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

export function buildMultimodalOpenAIPayload(
    form: MultimodalOpenAIConfig,
    clearApiKey = false,
): MultimodalOpenAIConfigUpdate {
    return {
        base_url: form.base_url.trim(),
        api_key: clearApiKey ? '' : form.api_key.trim(),
        clear_api_key: clearApiKey,
        model: form.model.trim(),
        stream: form.stream,
    };
}

export function buildBigModelPayload(form: BigModelConfig, clearApiKey = false): BigModelConfigUpdate {
    return {
        base_url: form.base_url.trim(),
        api_key: clearApiKey ? '' : form.api_key.trim(),
        clear_api_key: clearApiKey,
        text_model: form.text_model.trim(),
        image_model: form.image_model.trim(),
        stream: form.stream,
    };
}

export function buildProviderPreview(rows: Array<[string, string]>) {
    return rows;
}
