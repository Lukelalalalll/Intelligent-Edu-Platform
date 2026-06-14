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
        providerHealth: preferences.providerHealth,
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

    useEffect(() => {
        aiMemoryApi.get().then(d => setMemory(d.memory || {})).catch(() => {});
    }, []);

    const save = useCallback(async (form: Record<string, unknown>) => {
        setSaving(true);
        try {
            const res = await aiMemoryApi.update(form);
            setMemory((res.memory || form) as Record<string, unknown>);
            setOpen(false);
        } catch {
            // keep modal open for retry
        } finally {
            setSaving(false);
        }
    }, []);

    return { memory, open, setOpen, saving, save };
}
