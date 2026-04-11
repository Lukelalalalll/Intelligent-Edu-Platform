import { useState, useEffect } from 'react';
import client from '../../../api/client';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

export function useMdProcessorTextInput() {
    const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
    const [textContent, setTextContent] = useState('');
    const [textTitle, setTextTitle] = useState('');
    const [seedContent, setSeedContent] = useState('');
    const [cozeLoading, setCozeLoading] = useState(false);
    const [cozeError, setCozeError] = useState('');
    const [textProcessing, setTextProcessing] = useState(false);
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    const handleCozeGenerate = async () => {
        const seed = seedContent.trim();
        const topic = textTitle.trim();
        if (!seed) { setCozeError('Please enter some base content first'); return; }
        setCozeLoading(true);
        setCozeError('');
        try {
            const prompt = topic
                ? `Topic: ${topic}\n\nBase content:\n${seed}\n\nPlease generate a clear, presentation-ready markdown document based on the content above.`
                : `Base content:\n${seed}\n\nPlease generate a clear, presentation-ready markdown document based on the content above.`;
            const res = await client.post('/slides/coze-generate-outline', { keywords: prompt, provider });
            setTextContent(res.data.text || '');
        } catch (error: unknown) {
            const e = error as { response?: { data?: { detail?: string } }; message?: string };
            setCozeError(e.response?.data?.detail || 'AI generation failed: ' + (e.message ?? ''));
        } finally {
            setCozeLoading(false);
        }
    };

    const handleProcessText = async (redirectUrl: string, navigate: (url: string) => void, setErrorMsg: (msg: string) => void) => {
        if (!textContent.trim()) { setErrorMsg('Please enter or generate some content first'); return; }
        setTextProcessing(true);
        setErrorMsg('');
        try {
            const res = await client.post('/slides/process-text', {
                text: textContent.trim(),
                title: textTitle.trim() || 'untitled',
            });
            if (res.data.filename) {
                localStorage.setItem('combinedFilename', res.data.filename);
                if (redirectUrl) setTimeout(() => navigate(redirectUrl), 300);
            }
        } catch (error: unknown) {
            const e = error as { response?: { data?: { detail?: string } }; message?: string };
            setErrorMsg(e.response?.data?.detail || 'Processing failed: ' + (e.message ?? ''));
        } finally {
            setTextProcessing(false);
        }
    };

    return {
        inputMode, setInputMode,
        textContent, setTextContent,
        textTitle, setTextTitle,
        seedContent, setSeedContent,
        cozeLoading, cozeError,
        textProcessing,
        provider, setProvider,
        handleCozeGenerate,
        handleProcessText,
    };
}
