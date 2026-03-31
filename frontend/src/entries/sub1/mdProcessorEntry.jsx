import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import MdProcessorPage from '../../domains/slides_generator/pages/MdProcessorPage';

export default function MdProcessorEntry() {
    const navigate = useNavigate();

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

    // === API 请求：上传文件 ===
    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) { setErrorMsg('Please select a file'); return; }
        if (file.size > 10 * 1024 * 1024) { setErrorMsg('File size exceeds 10MB limit'); return; }

        setUploadStatus('start');
        setUploadProgress(0);
        setLoading(true);
        setErrorMsg('');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('use_llm', useLLM ? 'true' : 'false');

        try {
            // 使用 axios 替代原来的 XMLHttpRequest，代码更优雅
            const response = await client.post('/sub1/parse-md', formData, { // 注意：后端的路由名字要对应
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
            setErrorMsg(error.response?.data?.message || error.response?.data?.error || 'Upload failed');
        } finally {
            setLoading(false);
        }
    };

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
            const response = await client.post('/sub1/combine', {
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
            const res = await client.post('/sub1/coze-generate-outline', { keywords: textTitle.trim() });
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
            const res = await client.post('/sub1/process-text', {
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

    const pageProps = {
        file, useLLM, isDragging, uploadStatus, uploadProgress, headers, selectedIndices, loading, errorMsg,
        fileInputRef, setUseLLM, handleDragOver, handleDragLeave, handleDrop, onFileChange, clearFile,
        handleUpload, handleCheckboxChange, combineSections,
        // Tab 2 props
        inputMode, setInputMode, textContent, setTextContent, textTitle, setTextTitle,
        cozeLoading, cozeError, textProcessing,
        handleCozeGenerate, handleProcessText,
    };

    return <MdProcessorPage {...pageProps} />;
}