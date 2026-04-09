import { useState } from 'react';
import client from '../../../api/client';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

function extractErrorMessage(err: any): string {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
    }
    if (typeof detail === 'string' && detail.trim()) return detail;
    return err?.response?.data?.error || err?.message || 'Unknown error';
}

export function useDiagramGenerate() {
    const [genFile, setGenFile] = useState(null);
    const [isGenDragging, setIsGenDragging] = useState(false);
    const [genLoading, setGenLoading] = useState(false);
    const [genData, setGenData] = useState(null);
    const [genError, setGenError] = useState('');
    const [genInputMode, setGenInputMode] = useState('file');
    const [genText, setGenText] = useState('');
    const [cozeKeywords, setCozeKeywords] = useState('');
    const [cozeLoading, setCozeLoading] = useState(false);
    const [cozeText, setCozeText] = useState('');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    const handleGenerate = async () => {
        setGenLoading(true); setGenError(''); setGenData(null);
        const formData = new FormData();
        if (genInputMode === 'file') {
            if (!genFile) { setGenError('Please select a file first'); setGenLoading(false); return; }
            formData.append('promptFile', genFile);
        } else {
            const textToSend = genInputMode === 'coze' ? cozeText : genText;
            if (!textToSend.trim()) { setGenError('Please enter or generate text content first'); setGenLoading(false); return; }
            formData.append('promptText', textToSend);
        }
        try {
            const res = await client.post('/diagram/generate_diagram', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 });
            setGenData(res.data);
        } catch (err) {
            setGenError(extractErrorMessage(err));
        } finally {
            setGenLoading(false);
        }
    };

    const handleCozeGenerate = async () => {
        if (!cozeKeywords.trim()) { setGenError('Please enter keywords'); return; }
        setCozeLoading(true); setGenError(''); setCozeText('');
        const formData = new FormData();
        formData.append('keywords', cozeKeywords);
        formData.append('provider', provider);
        try {
            const res = await client.post('/diagram/coze_generate_text', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
            setCozeText(res.data.text || '');
        } catch (err) {
            setGenError(extractErrorMessage(err));
        } finally {
            setCozeLoading(false);
            setStoredAIProvider(provider);
        }
    };

    return {
        genState: { file: genFile, isDragging: isGenDragging, loading: genLoading, data: genData, error: genError, inputMode: genInputMode, text: genText, cozeKeywords, cozeLoading, cozeText, provider },
        genHandlers: {
            handleFileChange: (e: any) => setGenFile(e.target.files[0]),
            handleDragOver: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(true); },
            handleDragLeave: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(false); },
            handleDrop: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(false); if (e.dataTransfer.files[0]) setGenFile(e.dataTransfer.files[0]); },
            handleGenerate,
            setInputMode: setGenInputMode,
            setText: setGenText,
            setCozeKeywords,
            setProvider: (next: AIProvider) => {
                setProvider(next);
                setStoredAIProvider(next);
            },
            handleCozeGenerate,
            setCozeText,
        },
    };
}
