import React, { useState, useRef } from 'react';
import client from '../../api/client';
import MdProcessorPage from '../../pages/sub1/MdProcessor';

export default function MdProcessorEntry() {
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
            // 使用 axios 替代 fetch
            const response = await client.post('/sub1/combine', {
                filename: currentFilename,
                selected_indices: selectedIndices
            });

            const data = response.data;
            if (data.filename) {
                localStorage.setItem('combinedFilename', data.filename);
                localStorage.setItem('currentFilename', JSON.stringify(data.filename));
                if (redirectUrl.includes('processor')) {
                    localStorage.setItem('chapterData', JSON.stringify([]));
                }
                if (redirectUrl) {
                    setTimeout(() => { window.location.href = redirectUrl; }, 300);
                }
            }
        } catch (error) {
            setErrorMsg(error.response?.data?.error || 'Combination failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const pageProps = {
        file, useLLM, isDragging, uploadStatus, uploadProgress, headers, selectedIndices, loading, errorMsg,
        fileInputRef, setUseLLM, handleDragOver, handleDragLeave, handleDrop, onFileChange, clearFile,
        handleUpload, handleCheckboxChange, combineSections
    };

    return <MdProcessorPage {...pageProps} />;
}