import { useState, useEffect } from 'react';
import client from '@/shared/api/client';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../../../shared/aiProvider';

export type MdProcessorTextResult = {
    filename: string;
    content: string;
    title: string;
};

export function useMdProcessorTextInput() {
    const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
    const [textContent, setTextContent] = useState('');
    const [textTitle, setTextTitle] = useState('');
    const [seedContent, setSeedContent] = useState('');
    const [cozeLoading, setCozeLoading] = useState(false);
    const [cozeError, setCozeError] = useState('');
    const [processError, setProcessError] = useState('');
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

    const processTextInline = async (): Promise<MdProcessorTextResult | null> => {
        if (!textContent.trim()) {
            setProcessError('Please enter or generate some content first');
            return null;
        }
        setTextProcessing(true);
        setProcessError('');
        try {
            const res = await client.post('/slides/process-text', {
                text: textContent.trim(),
                title: textTitle.trim() || 'untitled',
            });
            const filename = res.data.filename;
            if (!filename) {
                throw new Error('Processing failed');
            }
            localStorage.setItem('combinedFilename', filename);
            localStorage.setItem('currentDisplayFilename', textTitle.trim() || 'untitled');
            localStorage.removeItem('currentFilename');
            localStorage.setItem('slidesSourceKind', 'text');
            localStorage.setItem('slidesSourceFilename', '');
            localStorage.setItem('slidesSourceDisplayName', textTitle.trim() || 'untitled');
            const contentRes = await client.get(`/slides/download/${filename}`);
            const content = typeof contentRes.data === 'string' ? contentRes.data : contentRes.data?.content || '';
            return {
                filename,
                content,
                title: textTitle.trim() || 'untitled',
            };
        } catch (error: unknown) {
            const e = error as { response?: { data?: { detail?: string } }; message?: string };
            setProcessError(e.response?.data?.detail || 'Processing failed: ' + (e.message ?? ''));
            return null;
        } finally {
            setTextProcessing(false);
        }
    };

    const handleProcessText = async (redirectUrl: string, navigate: (url: string) => void, setErrorMsg: (msg: string) => void) => {
        const result = await processTextInline();
        if (result?.filename && redirectUrl) setTimeout(() => navigate(redirectUrl), 300);
    };

    return {
        inputMode, setInputMode,
        textContent, setTextContent,
        textTitle, setTextTitle,
        seedContent, setSeedContent,
        cozeLoading, cozeError,
        processError,
        textProcessing,
        provider, setProvider,
        handleCozeGenerate,
        processTextInline,
        handleProcessText,
        resetGeneratedText: () => setTextContent(''),
    };
}
