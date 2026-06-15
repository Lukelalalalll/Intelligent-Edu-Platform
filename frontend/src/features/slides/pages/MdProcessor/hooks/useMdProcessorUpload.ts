import { useState, useRef, useCallback } from 'react';
import client from '@/shared/api/client';

export function useMdProcessorUpload() {
    const [file, setFile] = useState<File | null>(null);
    const [useLLM, setUseLLM] = useState(false);
    const [headerLlmProvider, setHeaderLlmProvider] = useState<'local_ollama' | 'coze' | 'deepseek'>('local_ollama');
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'start' | 'success' | 'error'>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFilename, setCurrentFilename] = useState('');
    const [headers, setHeaders] = useState<unknown[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback((selectedFile: File) => {
        setFile(selectedFile);
        setErrorMsg('');
        setUploadStatus('idle');
    }, []);

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            handleFileSelect(droppedFile);
            if (fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(droppedFile);
                fileInputRef.current.files = dataTransfer.files;
            }
        }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) handleFileSelect(selectedFile);
    };

    const clearFile = useCallback(() => {
        setFile(null);
        setUploadStatus('idle');
        setUploadProgress(0);
        setCurrentFilename('');
        setHeaders([]);
        setSelectedIndices([]);
        setErrorMsg('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const processFile = useCallback(async (targetFile: File) => {
        if (!targetFile) { setErrorMsg('Please select a file'); return; }
        if (targetFile.size > 10 * 1024 * 1024) { setErrorMsg('File size exceeds 10MB limit'); return; }

        setUploadStatus('start');
        setUploadProgress(0);
        setLoading(true);
        setErrorMsg('');

        try {
            await client.get('/session', {
                headers: { 'X-Skip-Auth-Retry': '1' },
            });

            const formData = new FormData();
            formData.append('file', targetFile);
            formData.append('use_llm', useLLM ? 'true' : 'false');
            if (useLLM) formData.append('header_llm_provider', headerLlmProvider);

            const response = await client.post('/slides/parse-md', formData, {
                onUploadProgress: (progressEvent) => {
                    const percentComplete = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1));
                    setUploadProgress(percentComplete);
                },
            });
            const data = response.data;
            setUploadProgress(100);
            setUploadStatus('success');
            setCurrentFilename(data.filename);
            localStorage.setItem('currentFilename', data.filename);
            if (data.tables) localStorage.setItem('currentTables', JSON.stringify(data.tables));
            setHeaders(data.headers || []);
            setSelectedIndices([]);
            setTimeout(() => { setUploadStatus('idle'); setUploadProgress(0); }, 1000);
        } catch (error: unknown) {
            const e = error as { response?: { data?: { detail?: string; message?: string; error?: string } }; message?: string };
            setUploadStatus('error');
            setErrorMsg(e.response?.data?.detail || e.response?.data?.message || e.response?.data?.error || e.message || 'Upload failed');
        } finally {
            setLoading(false);
        }
    }, [useLLM, headerLlmProvider]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (file) await processFile(file);
    };

    const handleCheckboxChange = useCallback((index: number) => {
        setSelectedIndices((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]);
    }, []);

    const combineSections = useCallback(async (redirectUrl: string, navigate: (url: string) => void) => {
        if (selectedIndices.length === 0) { setErrorMsg('Please select at least one section'); return; }
        setLoading(true);
        setErrorMsg('');
        try {
            const response = await client.post('/slides/combine', {
                filename: currentFilename,
                selected_indices: selectedIndices,
                use_llm: useLLM,
                header_llm_provider: headerLlmProvider,
            });
            const data = response.data;
            if (data.filename) {
                localStorage.setItem('combinedFilename', data.filename);
                localStorage.setItem('useLLM', JSON.stringify(useLLM));
                if (redirectUrl.includes('processor')) localStorage.setItem('chapterData', JSON.stringify([]));
                if (redirectUrl) setTimeout(() => navigate(redirectUrl), 300);
            }
        } catch (error: unknown) {
            const e = error as { response?: { data?: { error?: string } }; message?: string };
            setErrorMsg(e.response?.data?.error || 'Combination failed: ' + (e.message ?? ''));
        } finally {
            setLoading(false);
        }
    }, [selectedIndices, currentFilename, useLLM, headerLlmProvider]);

    const proceedWithFullDoc = useCallback(async (redirectUrl: string, navigate: (url: string) => void) => {
        if (!currentFilename) return;
        setLoading(true);
        setErrorMsg('');
        try {
            const res = await client.post('/slides/combine', {
                filename: currentFilename,
                selected_indices: (headers as Array<{ index: number }>).map((h) => h.index),
                use_llm: useLLM,
                header_llm_provider: headerLlmProvider,
            });
            if (res.data.filename) {
                localStorage.setItem('combinedFilename', res.data.filename);
                localStorage.setItem('useLLM', JSON.stringify(useLLM));
                if (redirectUrl) setTimeout(() => navigate(redirectUrl), 300);
            }
        } catch {
            const mdName = currentFilename.toLowerCase().endsWith('.pdf')
                ? currentFilename.replace(/\.pdf$/i, '.md')
                : currentFilename;
            localStorage.setItem('combinedFilename', mdName);
            localStorage.setItem('useLLM', JSON.stringify(useLLM));
            if (redirectUrl) setTimeout(() => navigate(redirectUrl), 300);
        } finally {
            setLoading(false);
        }
    }, [currentFilename, headers, useLLM, headerLlmProvider]);

    return {
        file, setFile, useLLM, setUseLLM, headerLlmProvider, setHeaderLlmProvider,
        isDragging, uploadStatus, uploadProgress,
        currentFilename, headers, selectedIndices, loading, errorMsg, setErrorMsg,
        fileInputRef, handleDragOver, handleDragLeave, handleDrop, onFileChange,
        clearFile, processFile, handleUpload, handleCheckboxChange, combineSections, proceedWithFullDoc,
    };
}
