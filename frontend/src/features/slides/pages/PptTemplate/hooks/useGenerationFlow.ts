import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { slidesEditorApi, type EditorSession } from '../../../api/slidesApi';
import type { AIProvider } from '../../../../../shared/aiProvider';

type LayoutMode = 'auto' | 'manual';

type Params = {
    selectedTheme: string | null;
    pptSchema: Record<string, unknown> | null;
    onBeforeGenerate?: () => void;
    onAfterGenerate?: () => void;
};

export function useGenerationFlow({ selectedTheme, pptSchema, onBeforeGenerate, onAfterGenerate }: Params) {
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('auto');
    const [aiProvider, setAiProvider] = useState<AIProvider>('local_ollama');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateProgress, setGenerateProgress] = useState(0);
    const [session, setSession] = useState<EditorSession | null>(null);
    const [assignedSchema, setAssignedSchema] = useState<Record<string, unknown> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        let intervalId: number | undefined;
        if (isGenerating) {
            setGenerateProgress(5);
            intervalId = window.setInterval(() => {
                setGenerateProgress((prev) => (prev < 90 ? prev + Math.random() * 5 : prev));
            }, 800);
        } else {
            setGenerateProgress(100);
        }

        return () => {
            if (intervalId) {
                window.clearInterval(intervalId);
            }
        };
    }, [isGenerating]);

    const resetGeneratedState = useCallback(() => {
        setSession(null);
        setAssignedSchema(null);
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!selectedTheme || !pptSchema) return;

        setIsGenerating(true);
        setGenerateProgress(0);
        resetGeneratedState();
        onBeforeGenerate?.();

        const abortCtrl = new AbortController();
        abortControllerRef.current = abortCtrl;

        try {
            const finalSchema =
                layoutMode === 'auto'
                    ? (
                          await slidesEditorApi.autoAssignLayouts({
                              provider: aiProvider,
                              theme: selectedTheme,
                              ppt_schema: pptSchema,
                          })
                      ).ppt_schema
                    : pptSchema;

            if (abortCtrl.signal.aborted) {
                throw new Error('Generation cancelled');
            }

            const nextSession = await slidesEditorApi.renderEditorSession({
                theme: selectedTheme,
                ppt_schema: finalSchema,
            });

            if (abortCtrl.signal.aborted) {
                throw new Error('Generation cancelled');
            }

            setAssignedSchema(finalSchema);
            setSession(nextSession);
            onAfterGenerate?.();
            toast.success('Slides generated! You can preview and add images below.');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Generation failed';
            if (message === 'Generation cancelled') {
                toast('Generation cancelled');
            } else {
                toast.error(message);
            }
        } finally {
            setIsGenerating(false);
            setGenerateProgress(100);
        }
    }, [aiProvider, layoutMode, onAfterGenerate, onBeforeGenerate, pptSchema, resetGeneratedState, selectedTheme]);

    const handleCancelGenerate = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsGenerating(false);
    }, []);

    const canGenerate = useMemo(() => Boolean(selectedTheme && pptSchema), [pptSchema, selectedTheme]);

    return {
        layoutMode,
        setLayoutMode,
        aiProvider,
        setAiProvider,
        isGenerating,
        generateProgress,
        session,
        setSession,
        assignedSchema,
        canGenerate,
        resetGeneratedState,
        handleGenerate,
        handleCancelGenerate,
    };
}
