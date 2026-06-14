import { useEffect, useRef, useState } from 'react';

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

const VALID_SEARCH_ENGINES: AISearchEngine[] = ['auto', 'google', 'bing', 'duckduckgo', 'wikipedia', 'arxiv', 'google_scholar'];

export function useAIChatPreferences() {
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
        const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
        if (stored === 'coze') return 'coze';
        if (stored === 'deepseek') return 'deepseek';
        return 'local_ollama';
    });
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

    usePersistAiPreferences(selectedProvider, tutorMode, webSearch, searchEngine, enableThinking);
    useProviderHealthCheck(selectedProvider, setProviderHealth);

    return {
        selectedProvider,
        setSelectedProvider,
        tutorMode,
        setTutorMode,
        webSearch,
        setWebSearch,
        searchEngine,
        setSearchEngine,
        enableThinking,
        setEnableThinking,
        providerHealth,
        webSearchRef,
        searchEngineRef,
        enableThinkingRef,
    };
}
