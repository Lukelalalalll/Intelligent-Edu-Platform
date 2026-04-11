import { useState } from 'react';
import client from '../../../api/client';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';
import { beautifySvg } from '../../../features/diagram/utils/beautifySvg';

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
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    const handleGenerate = async () => {
        setGenLoading(true); setGenError(''); setGenData(null);
        const formData = new FormData();
        if (genInputMode === 'file') {
            if (!genFile) { setGenError('Please select a file first'); setGenLoading(false); return; }
            formData.append('promptFile', genFile);
        } else {
            if (!genText.trim()) { setGenError('Please enter text content first'); setGenLoading(false); return; }
            formData.append('promptText', genText);
        }
        formData.append('provider', provider);
        try {
            const res = await client.post('/diagram/generate_diagram', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 });
            const rawSvg = String(res?.data?.svg || '');
            const polishedSvg = rawSvg ? beautifySvg(rawSvg) : rawSvg;
            setGenData({ ...res.data, svg: polishedSvg });
        } catch (err) {
            setGenError(extractErrorMessage(err));
        } finally {
            setGenLoading(false);
        }
    };

    return {
        genState: { file: genFile, isDragging: isGenDragging, loading: genLoading, data: genData, error: genError, inputMode: genInputMode, text: genText, provider },
        genHandlers: {
            handleFileChange: (e: any) => setGenFile(e.target.files[0]),
            handleDragOver: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(true); },
            handleDragLeave: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(false); },
            handleDrop: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(false); if (e.dataTransfer.files[0]) setGenFile(e.dataTransfer.files[0]); },
            handleGenerate,
            setInputMode: setGenInputMode,
            setText: setGenText,
            setProvider: (next: AIProvider) => {
                setProvider(next);
                setStoredAIProvider(next);
            },
        },
    };
}
