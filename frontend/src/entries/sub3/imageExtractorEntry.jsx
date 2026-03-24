import React, { useState, useCallback } from 'react';
import client from '../../api/client';
import ImageExtractorPage from '../../pages/sub3/ImageExtractor';

export default function ImageExtractorEntry() {
    // --- 状态管理 ---
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const [imagesByChapter, setImagesByChapter] = useState({});
    const [currentChapter, setCurrentChapter] = useState('None');

    const [activeTab, setActiveTab] = useState('uploaded');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiNum, setAiNum] = useState(4);
    const [aiImages, setAiImages] = useState([]);

    const [selectedImages, setSelectedImages] = useState([]);

    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('Processing...');
    const [lightboxImage, setLightboxImage] = useState(null);
    const [notifications, setNotifications] = useState([]);

    // --- 辅助方法 ---
    const notify = useCallback((message, type = 'info') => {
        const id = Date.now() + Math.random();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
    }, []);

    const processUpload = async (file) => {
        if (!file || file.type !== 'application/pdf') {
            notify('Please select a valid PDF file.', 'error');
            return;
        }
        setLoading(true); setLoadingText('Extracting images from PDF...');
        setUploadStatus('Processing PDF...');

        const formData = new FormData();
        formData.append('pdf', file);

        try {
            // ⚠️ 确保后端有这个接口 /api/sub3/extract-pdf-images
            const res = await client.post('/sub3/extract-pdf-images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                // 适配后端返回结构：假设返回 { imagesByChapter: { 'Chapter 1': [{src: 'base64...'}...] } }
                const extractedDict = res.data.imagesByChapter || {};
                setImagesByChapter(extractedDict);

                const firstChapter = Object.keys(extractedDict)[0] || 'None';
                setCurrentChapter(firstChapter);

                setUploadStatus(`✅ Extracted ${res.data.totalImages || 0} images.`);
                notify('PDF processed successfully!', 'success');
                setActiveTab('uploaded');
            }
        } catch (error) {
            setUploadStatus(`❌ ${error.response?.data?.error || 'Extraction failed'}`);
            notify('Failed to process PDF', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- 交互处理 ---
    const handleDragOver = e => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = e => { e.preventDefault(); setIsDragging(false); processUpload(e.dataTransfer.files[0]); };
    const handleFileInput = e => { processUpload(e.target.files[0]); e.target.value = ''; };

    const generateAiImages = async () => {
        if (!aiPrompt.trim()) { notify('Please enter a prompt', 'error'); return; }
        setLoading(true); setLoadingText('AI is generating images...');

        try {
            const res = await client.post('/sub3/generate-ai-images', { prompt: aiPrompt, num_images: Number(aiNum) });
            if (res.data.success) {
                // 适配返回: { images: [{src: '...'}, ...] }
                setAiImages(res.data.images || []);
                notify(`Generated ${res.data.images.length} images`, 'success');
            }
        } catch (error) {
            notify(error.response?.data?.error || 'Failed to generate images', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleImageSelection = (imgObj) => {
        setSelectedImages(prev => {
            const exists = prev.some(s => s.src === imgObj.src);
            if (exists) {
                notify('Image removed', 'info');
                return prev.filter(s => s.src !== imgObj.src);
            } else {
                notify('Image added', 'success');
                return [...prev, imgObj];
            }
        });
    };

    const removeSelectedImage = (imgObj) => {
        setSelectedImages(prev => prev.filter(s => s.src !== imgObj.src));
        notify('Image removed', 'info');
    };

    const handleDownloadBlob = async (endpoint, filename) => {
        if (selectedImages.length === 0) return;
        setLoading(true); setLoadingText(`Preparing ${filename}...`);
        try {
            const res = await client.post(endpoint, { images: selectedImages }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            notify(`${filename} downloaded!`, 'success');
        } catch (error) {
            notify(`Failed to export ${filename}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // 绑定打包
    const states = { isDragging, uploadStatus, currentChapter, activeTab, imagesByChapter, selectedImages, aiPrompt, aiNum, aiImages, loading, loadingText, lightboxImage, notifications };
    const handlers = { handleDragOver, handleDragLeave, handleDrop, handleFileInput, setCurrentChapter, setActiveTab, setAiPrompt, setAiNum, generateAiImages, toggleImageSelection, removeSelectedImage, setLightboxImage, exportZip: () => handleDownloadBlob('/sub3/export-zip', 'selected_images.zip'), exportPDF: () => handleDownloadBlob('/sub3/export-pdf', 'selected_images.pdf') };

    return <ImageExtractorPage states={states} handlers={handlers} />;
}