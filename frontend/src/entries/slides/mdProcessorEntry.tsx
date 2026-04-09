import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { chatApi } from '../../api/chatApi';
import MdProcessorPage from '../../features/slides/pages/MdProcessorPage';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../shared/aiProvider';

export default function MdProcessorEntry() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // === 状态管理 ===
    const [file, setFile] = useState(null);
    const [useLLM, setUseLLM] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const [uploadStatus, setUploadStatus] = useState('idle'); // idle, start, success, error
    const [uploadProgress, setUploadProgress] = useState(0);

    const [currentFilename, setCurrentFilename] = useState('');
    const [headers, setHeaders] = useState([]);
    const [selectedIndices, setSelectedIndices] = useState([]);

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const fileInputRef = useRef(null);

    // === Tab 2: Text Input ===
    const [inputMode, setInputMode] = useState('file');       // 'file' | 'text'
    const [textContent, setTextContent] = useState('');
    const [textTitle, setTextTitle] = useState('');
    const [cozeLoading, setCozeLoading] = useState(false);
    const [cozeError, setCozeError] = useState('');
    const [textProcessing, setTextProcessing] = useState(false);
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    // === Transfer auto-consumption ===
    const transferConsumedRef = useRef(false);

    // === 文件与拖拽操作 ===
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
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

    const onFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) handleFileSelect(selectedFile);
    };

    const handleFileSelect = (selectedFile) => {
        setFile(selectedFile);
        setErrorMsg('');
        setUploadStatus('idle');
    };

    const clearFile = () => {
        setFile(null);
        setUploadStatus('idle');
        setUploadProgress(0);
        setCurrentFilename('');
        setHeaders([]);
        setSelectedIndices([]);
        setErrorMsg('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // === API 请求：上传文件 (核心逻辑) ===
    const processFile = async (targetFile) => {
        if (!targetFile) { setErrorMsg('Please select a file'); return; }
        if (targetFile.size > 10 * 1024 * 1024) { setErrorMsg('File size exceeds 10MB limit'); return; }

        setUploadStatus('start');
        setUploadProgress(0);
        setLoading(true);
        setErrorMsg('');

        const formData = new FormData();
        formData.append('file', targetFile);
        formData.append('use_llm', useLLM ? 'true' : 'false');

        try {
            const response = await client.post('/slides/parse-md', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentComplete);
                }
            });

            const data = response.data;
            setUploadProgress(100);
            setUploadStatus('success');
            setCurrentFilename(data.filename);
            localStorage.setItem('currentFilename', JSON.stringify(data.filename));
            if (data.tables) localStorage.setItem('currentTables', JSON.stringify(data.tables));

            setHeaders(data.headers || []);
            setSelectedIndices([]);

            setTimeout(() => {
                setUploadStatus('idle');
                setUploadProgress(0);
            }, 1000);

        } catch (error) {
            setUploadStatus('error');
            setErrorMsg(error.response?.data?.detail || error.response?.data?.message || error.response?.data?.error || 'Upload failed');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        await processFile(file);
    };

    // === Transfer auto-consumption (after processFile is defined) ===
    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId || transferConsumedRef.current) return;
        transferConsumedRef.current = true;

        (async () => {
            try {
                const { file: transferFile } = await chatApi.transferConsumeAndDownload(transferId);
                setFile(transferFile);
                setErrorMsg('');

                // Auto-trigger upload processing
                await processFile(transferFile);

                // Remove transfer_id from URL
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete('transfer_id');
                    return next;
                }, { replace: true });
            } catch (err) {
                console.error('[Transfer] consume failed', err);
                setErrorMsg('Failed to load transferred file');
            }
        })();
    }, [searchParams, setSearchParams]);

    const handleCheckboxChange = (index) => {
        setSelectedIndices(prev =>
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
    };

    // === API 请求：组合文件 ===
    const combineSections = async (redirectUrl) => {
        if (selectedIndices.length === 0) {
            setErrorMsg('Please select at least one section');
            return;
        }

        setLoading(true);
        setErrorMsg('');

        try {
            // 🌟 核心修复：把 useLLM 传给后端，确保解析逻辑跟上传时完全一致
            const response = await client.post('/slides/combine', {
                filename: currentFilename,
                selected_indices: selectedIndices,
                use_llm: useLLM  // <--- 关键参数：同步 LLM 状态
            });

            const data = response.data;
            if (data.filename) {
                // 存储合并后的文件名
                localStorage.setItem('combinedFilename', data.filename);
                // 同时也记录下当前是否是 LLM 模式，方便后续页面判断
                localStorage.setItem('useLLM', JSON.stringify(useLLM));

                if (redirectUrl.includes('processor')) {
                    localStorage.setItem('chapterData', JSON.stringify([]));
                }

                if (redirectUrl) {
                    setTimeout(() => { navigate(redirectUrl); }, 300);
                }
            }
        } catch (error) {
            setErrorMsg(error.response?.data?.error || 'Combination failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // === Coze AI: Generate outline from keywords ===
    const handleCozeGenerate = async () => {
        if (!textTitle.trim()) {
            setCozeError('Please enter a topic or keywords');
            return;
        }
        setCozeLoading(true);
        setCozeError('');
        try {
            const res = await client.post('/slides/coze-generate-outline', {
                keywords: textTitle.trim(),
                provider,
            });
            setTextContent(res.data.text || '');
        } catch (error) {
            setCozeError(error.response?.data?.detail || 'AI generation failed: ' + error.message);
        } finally {
            setCozeLoading(false);
        }
    };

    // === Process text directly into combined MD ===
    const handleProcessText = async (redirectUrl) => {
        if (!textContent.trim()) {
            setErrorMsg('Please enter or generate some content first');
            return;
        }
        setTextProcessing(true);
        setErrorMsg('');
        try {
            const res = await client.post('/slides/process-text', {
                text: textContent.trim(),
                title: textTitle.trim() || 'untitled',
            });
            if (res.data.filename) {
                localStorage.setItem('combinedFilename', res.data.filename);
                if (redirectUrl) {
                    setTimeout(() => navigate(redirectUrl), 300);
                }
            }
        } catch (error) {
            setErrorMsg(error.response?.data?.detail || 'Processing failed: ' + error.message);
        } finally {
            setTextProcessing(false);
        }
    };

    // When the PDF has no recognisable headers, let the user skip header
    // selection and proceed with the entire document.
    const proceedWithFullDoc = async (redirectUrl) => {
        if (!currentFilename) return;
        setLoading(true);
        setErrorMsg('');
        try {
            const res = await client.post('/slides/combine', {
                filename: currentFilename,
                selected_indices: headers.map(h => h.index),
                use_llm: useLLM,
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
    };

    const pageProps = {
        file, useLLM, isDragging, uploadStatus, uploadProgress, headers, selectedIndices, loading, errorMsg,
        currentFilename,
        fileInputRef, setUseLLM, handleDragOver, handleDragLeave, handleDrop, onFileChange, clearFile,
        handleUpload, handleCheckboxChange, combineSections, proceedWithFullDoc,
        // Tab 2 props
        inputMode, setInputMode, textContent, setTextContent, textTitle, setTextTitle,
        cozeLoading, cozeError, textProcessing,
        provider, setProvider,
        handleCozeGenerate, handleProcessText,
    };

    return <MdProcessorPage {...pageProps} />;
}