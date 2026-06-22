'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { RootState } from '@/store/store';

import { PresentationGenerationApi } from '../../services/api/presentation-generation';

interface UseAutoSaveOptions {
    debounceMs?: number;
    enabled?: boolean;
}

export const useAutoSave = ({
    debounceMs = 1000,
    enabled = true,
}: UseAutoSaveOptions = {}) => {
    const {
        presentationData,
        isStreaming,
        isLoading,
        isLayoutLoading,
        dirtyRevision,
    } = useSelector((state: RootState) => state.presentationGeneration);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedDirtyRevisionRef = useRef(0);
    const [isSaving, setIsSaving] = useState(false);

    const debouncedSave = useCallback(
        async (data: unknown, revision: number) => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            saveTimeoutRef.current = setTimeout(async () => {
                if (!data || isSaving) {
                    return;
                }

                if (revision <= 0 || revision <= lastSavedDirtyRevisionRef.current) {
                    return;
                }

                try {
                    setIsSaving(true);
                    await PresentationGenerationApi.updatePresentationContent(data);
                    lastSavedDirtyRevisionRef.current = revision;
                } catch (error) {
                    console.error('Auto-save failed:', error);
                } finally {
                    setIsSaving(false);
                }
            }, debounceMs);
        },
        [debounceMs, isSaving]
    );

    useEffect(() => {
        if (
            !enabled ||
            !presentationData ||
            isStreaming ||
            isLoading ||
            isLayoutLoading ||
            dirtyRevision <= 0
        ) {
            return;
        }

        void debouncedSave(presentationData, dirtyRevision);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [
        debouncedSave,
        dirtyRevision,
        enabled,
        isLayoutLoading,
        isLoading,
        isStreaming,
        presentationData,
    ]);

    return {
        isSaving,
    };
};
