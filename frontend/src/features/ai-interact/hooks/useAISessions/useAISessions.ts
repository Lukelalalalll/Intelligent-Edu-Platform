import { useState, useEffect, useCallback } from 'react';
import { aiMemoryApi } from '../../api/aiApi';
import { useAIChatPreferences } from './useAIChatPreferences';
import { useAISessionManager } from './useAISessionManager';

export function useAISessions() {
    const preferences = useAIChatPreferences();
    const manager = useAISessionManager({
        selectedProvider: preferences.selectedProvider,
        tutorMode: preferences.tutorMode,
        webSearchRef: preferences.webSearchRef,
        searchEngineRef: preferences.searchEngineRef,
        enableThinkingRef: preferences.enableThinkingRef,
    });

    return {
        ...manager,
        selectedProvider: preferences.selectedProvider,
        setSelectedProvider: preferences.setSelectedProvider,
        configuredChatModels: preferences.configuredChatModels,
        chatModelsLoading: preferences.chatModelsLoading,
        providerHealth: preferences.providerHealth,
        shouldCheckHealth: preferences.shouldCheckHealth,
        setShouldCheckHealth: preferences.setShouldCheckHealth,
        tutorMode: preferences.tutorMode,
        setTutorMode: preferences.setTutorMode,
        webSearch: preferences.webSearch,
        setWebSearch: preferences.setWebSearch,
        searchEngine: preferences.searchEngine,
        setSearchEngine: preferences.setSearchEngine,
        enableThinking: preferences.enableThinking,
        setEnableThinking: preferences.setEnableThinking,
    };
}

export function useAIMemory() {
    const [memory, setMemory] = useState<any>({});
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        if (loaded) return;
        try {
            const d = await aiMemoryApi.get();
            setMemory(d.memory || {});
            setLoaded(true);
        } catch {
            // swallow, allow retry on next open
        }
    }, [loaded]);

    useEffect(() => {
        if (open) {
            load();
        }
    }, [open, load]);

    const save = useCallback(async (form: Record<string, unknown>) => {
        setSaving(true);
        try {
            const res = await aiMemoryApi.update(form);
            setMemory((res.memory || form) as Record<string, unknown>);
            setLoaded(true);
            setOpen(false);
        } catch {
            // keep modal open for retry
        } finally {
            setSaving(false);
        }
    }, []);

    return { memory, open, setOpen, saving, save, loaded, load };
}
