import { useEffect, useRef, useState } from 'react';

import { aiConfigApi } from '@/features/ai-config/api/aiConfigApi';

import {
    type AIProviderHealth,
    type AIProvider,
    type AITutorMode,
    type AISearchEngine,
} from '../../api/aiApi';
import {
    PROVIDER_STORAGE_KEY,
    TUTOR_MODE_STORAGE_KEY,
    WEB_SEARCH_STORAGE_KEY,
    SEARCH_ENGINE_STORAGE_KEY,
    ENABLE_THINKING_STORAGE_KEY,
} from './utils/sessionHelpers';
import { usePersistAiPreferences, useProviderHealthCheck } from './utils/sessionLifecycle';
import {
    buildConfiguredChatModelOptions,
    type ChatModelOption,
} from '../../utils/chatModelOptions';

const VALID_SEARCH_ENGINES: AISearchEngine[] = ['auto', 'google', 'bing', 'duckduckgo', 'wikipedia', 'arxiv', 'google_scholar'];

export function useAIChatPreferences() {
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
        const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
        if (stored === 'coze') return 'coze';
        if (stored === 'deepseek') return 'deepseek';
        if (stored === 'openai') return 'openai';
        if (stored === 'claude') return 'claude';
        if (stored === 'bigmodel') return 'bigmodel';
        if (stored === 'minimax') return 'minimax';
        return 'local_ollama';
    });
    const [configuredChatModels, setConfiguredChatModels] = useState<ChatModelOption[]>([]);
    const [chatModelsLoading, setChatModelsLoading] = useState(true);
    const [tutorMode, setTutorMode] = useState<AITutorMode>(() => {
        const stored = localStorage.getItem(TUTOR_MODE_STORAGE_KEY);
        if (stored === 'tutor' || stored === 'hint_only') return stored;
        return 'hint_only';
    });
    const [webSearch, setWebSearch] = useState<boolean>(() => {
        return localStorage.getItem(WEB_SEARCH_STORAGE_KEY) === 'true';
    });
    const [searchEngine, setSearchEngine] = useState<AISearchEngine>(() => {
        const stored = localStorage.getItem(SEARCH_ENGINE_STORAGE_KEY) as AISearchEngine | null;
        return stored && VALID_SEARCH_ENGINES.includes(stored) ? stored : 'auto';
    });
    const [enableThinking, setEnableThinking] = useState<boolean>(() => {
        return localStorage.getItem(ENABLE_THINKING_STORAGE_KEY) === 'true';
    });
    const [providerHealth, setProviderHealth] = useState<AIProviderHealth>({
        provider: selectedProvider,
        ok: false,
        detail: 'Checking provider status...',
        checking: true,
    });
    const [shouldCheckHealth, setShouldCheckHealth] = useState(false);

    const webSearchRef = useRef(webSearch);
    const searchEngineRef = useRef(searchEngine);
    const enableThinkingRef = useRef(enableThinking);

    useEffect(() => {
        webSearchRef.current = webSearch;
    }, [webSearch]);

    useEffect(() => {
        searchEngineRef.current = searchEngine;
    }, [searchEngine]);

    useEffect(() => {
        enableThinkingRef.current = enableThinking;
    }, [enableThinking]);

    useEffect(() => {
        let cancelled = false;
        setChatModelsLoading(true);
        void aiConfigApi.get()
            .then((config) => {
                if (cancelled) return;
                setConfiguredChatModels(buildConfiguredChatModelOptions(config));
            })
            .catch(() => {
                if (cancelled) return;
                setConfiguredChatModels([]);
            })
            .finally(() => {
                if (cancelled) return;
                setChatModelsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (chatModelsLoading) {
            return;
        }

        if (configuredChatModels.length > 0) {
            const providerStillUsable = configuredChatModels.some((option) => option.provider === selectedProvider);
            if (!providerStillUsable) {
                setSelectedProvider(configuredChatModels[0].provider);
            }
            return;
        }

        if (selectedProvider !== 'local_ollama') {
            setSelectedProvider('local_ollama');
        }
    }, [chatModelsLoading, configuredChatModels, selectedProvider]);

    usePersistAiPreferences(selectedProvider, tutorMode, webSearch, searchEngine, enableThinking);
    useProviderHealthCheck(selectedProvider, setProviderHealth, shouldCheckHealth);

    return {
        selectedProvider,
        setSelectedProvider,
        configuredChatModels,
        chatModelsLoading,
        tutorMode,
        setTutorMode,
        webSearch,
        setWebSearch,
        searchEngine,
        setSearchEngine,
        enableThinking,
        setEnableThinking,
        providerHealth,
        shouldCheckHealth,
        setShouldCheckHealth,
        webSearchRef,
        searchEngineRef,
        enableThinkingRef,
    };
}
