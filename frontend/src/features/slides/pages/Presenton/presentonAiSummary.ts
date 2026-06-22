import type { AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';
import type { SlidesRuntimeProvider } from '../../api/slidesApi';

export type PresentonAiSummary = {
    preferredProvider: SlidesRuntimeProvider;
    label: string;
    model?: string;
    summary: string;
};

function hasOpenAI(config: AIConfigResponse | null | undefined): boolean {
    return Boolean(config?.openai?.api_key_set);
}

function hasDeepSeek(config: AIConfigResponse | null | undefined): boolean {
    return Boolean(config?.deepseek?.api_key_set);
}

export function buildPresentonAiSummary(config: AIConfigResponse | null | undefined): PresentonAiSummary {
    if (hasOpenAI(config)) {
        return {
            preferredProvider: 'openai',
            label: 'OpenAI',
            model: config?.openai?.model,
            summary: `Using project AI config: OpenAI${config?.openai?.model ? ` · ${config.openai.model}` : ''}`,
        };
    }

    if (hasDeepSeek(config)) {
        return {
            preferredProvider: 'deepseek',
            label: 'DeepSeek',
            model: config?.deepseek?.model,
            summary: `Using project AI config: DeepSeek${config?.deepseek?.model ? ` · ${config.deepseek.model}` : ''}`,
        };
    }

    return {
        preferredProvider: 'auto',
        label: 'Auto',
        summary: 'Using project AI config. Configure OpenAI or DeepSeek in your profile if generation fails.',
    };
}
