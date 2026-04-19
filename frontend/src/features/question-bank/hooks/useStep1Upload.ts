import { useState } from 'react';
import * as sub2Api from '../api/questionBankApi';
import type { GenerationMode, GenerationSource } from '../types';

interface UseStep1UploadOptions {
    showToast: (msg: string, type: string) => void;
}

export function useStep1Upload({ showToast }: UseStep1UploadOptions) {
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState('');
    const [fileType, setFileType] = useState('');
    const [totalPages, setTotalPages] = useState(0);
    const [selectedPages, setSelectedPages] = useState<number[]>([]);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [generationMode, setGenerationMode] = useState<GenerationMode>('extract_first');
    const [generationSource, setGenerationSource] = useState<GenerationSource>('pdf');

    /** Uploads the selected file and populates task context. Does NOT navigate. */
    const handleFile = async (selectedFile: File | null) => {
        if (!selectedFile) return;
        setFile(selectedFile);
        setGenerationSource('pdf');
        setUploadLoading(true);
        try {
            const data = await sub2Api.uploadFile(selectedFile);
            if (data.success) {
                setFileName(data.filename);
                setFileType(data.file_type);
                setTaskId(data.task_id);
                if (data.file_type === 'pdf') {
                    setTotalPages(data.total_pages);
                    setSelectedPages([]);
                }
            } else {
                showToast(data.error, 'error');
            }
        } catch (err: any) {
            showToast('Upload failed: ' + err.message, 'error');
        } finally {
            setUploadLoading(false);
        }
    };

    const selectGenerationMode = (mode: GenerationMode) => {
        setGenerationMode(mode);
        if (mode === 'pdf_direct') setGenerationSource('pdf');
    };

    return {
        // state (raw setters exposed for replayFromHistory in composing hook)
        file, setFile,
        fileName, setFileName,
        fileType, setFileType,
        totalPages, setTotalPages,
        selectedPages, setSelectedPages,
        uploadLoading, setUploadLoading,
        isDragging,
        taskId, setTaskId,
        generationMode,
        generationSource, setGenerationSource,
        // derived
        canEnterStep2: Boolean(file),
        // handlers
        handleFile,
        selectGenerationMode,
        handleDragOver: (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); },
        handleDragLeave: () => setIsDragging(false),
        handleDrop: (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); },
        togglePage: (i: number) => setSelectedPages(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i].sort((a, b) => a - b)),
        selectAllPages: () => setSelectedPages(Array.from({ length: totalPages }, (_, i) => i)),
        clearPageSelection: () => setSelectedPages([]),
    };
}
