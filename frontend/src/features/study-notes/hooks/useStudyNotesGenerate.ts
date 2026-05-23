import { useState, useCallback, useEffect } from 'react';
import client from '@/shared/api/client';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

export function useStudyNotesGenerate(file: File | null) {
    const [style, setStyle] = useState('detailed');
    const [notes, setNotes] = useState('');
    const [flashcards, setFlashcards] = useState<{ question?: string; answer?: string; }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('notes');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    const generateFromFile = useCallback(async (targetFile: File, targetStyle: string) => {
        if (!targetFile) return;
        setIsLoading(true);
        setLoadingText('Extracting text and generating study notes...');
        setError('');

        try {
            // Generate notes
            const formData = new FormData();
            formData.append('file', targetFile);
            formData.append('style', targetStyle);
            formData.append('provider', provider);
            const notesRes = await client.post('/study-notes/generate-notes', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (notesRes.data.success) {
                setNotes(notesRes.data.notes);
                setActiveTab('notes');
            }

            // Generate flashcards
            setLoadingText('Generating flashcards...');
            const flashForm = new FormData();
            flashForm.append('file', targetFile);
            flashForm.append('provider', provider);
            const flashRes = await client.post('/study-notes/generate-flashcards', flashForm, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (flashRes.data.success && flashRes.data.flashcards?.length > 0) {
                setFlashcards(flashRes.data.flashcards);
            }
            return true;
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to generate notes');
            return false;
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [provider]);

    const handleGenerate = useCallback(async () => {
        if (file) {
            return await generateFromFile(file, style);
        }
        return false;
    }, [file, style, generateFromFile]);

    return {
        style, setStyle,
        notes, setNotes,
        flashcards,
        isLoading, setIsLoading,
        loadingText, setLoadingText,
        error, setError,
        activeTab, setActiveTab,
        provider, setProvider,
        generateFromFile,
        handleGenerate,
    };
}
