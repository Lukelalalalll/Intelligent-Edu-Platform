import { describe, expect, it } from 'vitest';

import type { AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';

import {
    LOCAL_OLLAMA_FALLBACK_OPTION,
    buildConfiguredChatModelOptions,
    getSelectedChatModelOption,
} from './chatModelOptions';

const buildConfig = (): AIConfigResponse => ({
    deepseek: {
        base_url: 'https://api.deepseek.com',
        api_key: '',
        api_key_set: true,
        model: 'deepseek-v4-pro',
        stream: false,
        reasoning_effort: 'high',
        thinking_type: 'enabled',
        updated_at: null,
    },
    openai: {
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        api_key_set: true,
        model: 'gpt-5.5',
        stream: false,
        updated_at: null,
    },
    bigmodel: {
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: '',
        api_key_set: true,
        text_model: 'glm-4.5-flash',
        image_model: 'glm-5v-flash',
        stream: false,
        updated_at: null,
    },
    text: {
        deepseek: {
            base_url: 'https://api.deepseek.com',
            api_key: '',
            api_key_set: true,
            model: 'deepseek-v4-pro',
            stream: false,
            reasoning_effort: 'high',
            thinking_type: 'enabled',
            updated_at: null,
        },
        openai: {
            base_url: 'https://api.openai.com/v1',
            api_key: '',
            api_key_set: true,
            model: 'gpt-5.5',
            stream: false,
            updated_at: null,
        },
        bigmodel: {
            base_url: 'https://open.bigmodel.cn/api/paas/v4',
            api_key: '',
            api_key_set: true,
            model: 'glm-4.5-flash',
            stream: false,
            updated_at: null,
        },
    },
    multimodal: {
        openai: {
            base_url: 'https://api.openai.com/v1',
            api_key: '',
            api_key_set: true,
            model: 'gpt-4o',
            stream: false,
            updated_at: null,
        },
        bigmodel: {
            base_url: 'https://open.bigmodel.cn/api/paas/v4',
            api_key: '',
            api_key_set: true,
            model: 'glm-5v-flash',
            stream: false,
            updated_at: null,
        },
    },
});

describe('chatModelOptions', () => {
    it('builds configured chat model options from text-capable AI Config entries', () => {
        expect(buildConfiguredChatModelOptions(buildConfig())).toEqual([
            {
                provider: 'deepseek',
                modelLabel: 'deepseek-v4-pro',
                providerLabel: 'DeepSeek',
                source: 'ai_config',
            },
            {
                provider: 'openai',
                modelLabel: 'gpt-5.5',
                providerLabel: 'OpenAI',
                source: 'ai_config',
            },
            {
                provider: 'bigmodel',
                modelLabel: 'glm-4.5-flash',
                providerLabel: 'BigModel / GLM',
                source: 'ai_config',
            },
        ]);
    });

    it('skips providers without configured credentials', () => {
        const config = buildConfig();
        config.text.openai.api_key_set = false;
        config.text.bigmodel.api_key_set = false;

        expect(buildConfiguredChatModelOptions(config)).toEqual([
            {
                provider: 'deepseek',
                modelLabel: 'deepseek-v4-pro',
                providerLabel: 'DeepSeek',
                source: 'ai_config',
            },
        ]);
    });

    it('falls back to local ollama when the selected provider is not configured', () => {
        expect(getSelectedChatModelOption('local_ollama', [])).toEqual(LOCAL_OLLAMA_FALLBACK_OPTION);
    });
});
