import { useState } from 'react';
import client from '@/shared/api/client';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';
import { beautifySvg } from '../../../features/diagram/utils/beautifySvg';
import { extractErrorMessage } from '@/shared/utils/extractError';

export function useDiagramGenerate() {
    const [genFile, setGenFile] = useState(null);
    const [isGenDragging, setIsGenDragging] = useState(false);
    const [genLoading, setGenLoading] = useState(false);
    const [genData, setGenData] = useState(null);
    const [genError, setGenError] = useState('');
    const [genInputMode, setGenInputMode] = useState('file');
    const [genText, setGenText] = useState('');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    // AI-expanded diagram description state
    const [aiDescription, setAiDescription] = useState('');
    const [aiExpandLoading, setAiExpandLoading] = useState(false);
    const [aiExpandError, setAiExpandError] = useState('');

    const handleGenerate = async () => {
        setGenLoading(true); setGenError(''); setGenData(null);
        const formData = new FormData();
        if (genInputMode === 'file') {
            if (!genFile) { setGenError('Please select a file first'); setGenLoading(false); return; }
            formData.append('promptFile', genFile);
        } else {
            // Prefer AI-expanded description; fall back to raw text
            const promptText = aiDescription.trim() || genText.trim();
            if (!promptText) { setGenError('Please enter text content first'); setGenLoading(false); return; }
            formData.append('promptText', promptText);
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

    const handleAiExpand = async () => {
        const keywords = genText.trim();
        if (!keywords) { setAiExpandError('Please enter some keywords or a topic first.'); return; }
        setAiExpandLoading(true); setAiExpandError(''); setAiDescription('');
        const formData = new FormData();
        formData.append('keywords', keywords);
        formData.append('provider', provider);
        try {
            const res = await client.post('/diagram/coze_generate_text', formData);
            setAiDescription(res.data?.text || '');
        } catch (err) {
            setAiExpandError(extractErrorMessage(err));
        } finally {
            setAiExpandLoading(false);
        }
    };

    return {
        genState: {
            file: genFile,
            isDragging: isGenDragging,
            loading: genLoading,
            data: genData,
            error: genError,
            inputMode: genInputMode,
            text: genText,
            provider,
            aiDescription,
            aiExpandLoading,
            aiExpandError,
        },
        genHandlers: {
            handleFileChange: (e: any) => setGenFile(e.target.files[0]),
            handleDragOver: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(true); },
            handleDragLeave: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(false); },
            handleDrop: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsGenDragging(false); if (e.dataTransfer.files[0]) setGenFile(e.dataTransfer.files[0]); },
            handleGenerate,
            handleAiExpand,
            injectGenText: (text: string) => {
                setGenText(text);
                setGenInputMode('text');
                setGenData(null);
                setGenError('');
                setAiDescription('');
            },
            setInputMode: (mode: string) => {
                setGenInputMode(mode);
                setGenError('');
                setAiExpandError('');
            },
            setText: (val: string) => {
                setGenText(val);
                // Clear stale AI description when user edits the source
                setAiDescription('');
            },
            setAiDescription,
            setProvider: (next: AIProvider) => {
                setProvider(next);
                setStoredAIProvider(next);
            },
        },
    };
}
