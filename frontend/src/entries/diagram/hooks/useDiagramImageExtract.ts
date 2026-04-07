import { useState, useCallback } from 'react';
import client from '../../../api/client';

export function useDiagramImageExtract() {
    const [imgIsDragging, setImgIsDragging] = useState(false);
    const [imgUploadStatus, setImgUploadStatus] = useState('');
    const [imgImagesByChapter, setImgImagesByChapter] = useState({});
    const [imgCurrentChapter, setImgCurrentChapter] = useState('None');
    const [imgActiveTab, setImgActiveTab] = useState('uploaded');
    const [imgAiPrompt, setImgAiPrompt] = useState('');
    const [imgAiNum, setImgAiNum] = useState(4);
    const [imgAiImages, setImgAiImages] = useState([]);
    const [imgSelectedImages, setImgSelectedImages] = useState([]);
    const [imgLoading, setImgLoading] = useState(false);
    const [imgLoadingText, setImgLoadingText] = useState('Processing...');
    const [imgLightboxImage, setImgLightboxImage] = useState(null);
    const [imgNotifications, setImgNotifications] = useState([]);

    const imgNotify = useCallback((message: string, type = 'info') => {
        const id = Date.now() + Math.random();
        setImgNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => setImgNotifications(prev => prev.filter(n => n.id !== id)), 3000);
    }, []);

    const imgProcessUpload = async (file: File) => {
        if (!file || file.type !== 'application/pdf') { imgNotify('Please select a valid PDF file.', 'error'); return; }
        setImgLoading(true); setImgLoadingText('Extracting images from PDF...');
        setImgUploadStatus('Processing PDF...');
        const formData = new FormData();
        formData.append('pdf', file);
        try {
            const res = await client.post('/image-extractor/extract-pdf-images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                const extractedDict = res.data.imagesByChapter || {};
                setImgImagesByChapter(extractedDict);
                setImgCurrentChapter(Object.keys(extractedDict)[0] || 'None');
                setImgUploadStatus(`✅ Extracted ${res.data.totalImages || 0} images.`);
                imgNotify('PDF processed successfully!', 'success');
                setImgActiveTab('uploaded');
            }
        } catch (error: any) {
            setImgUploadStatus(`❌ ${error.response?.data?.error || 'Extraction failed'}`);
            imgNotify('Failed to process PDF', 'error');
        } finally { setImgLoading(false); }
    };

    const imgGenerateAi = async () => {
        if (!imgAiPrompt.trim()) { imgNotify('Please enter a prompt', 'error'); return; }
        setImgLoading(true); setImgLoadingText('AI is generating images...');
        try {
            const res = await client.post('/image-extractor/generate-ai-images', { prompt: imgAiPrompt, num_images: Number(imgAiNum) });
            if (res.data.success) {
                setImgAiImages(res.data.images || []);
                imgNotify(`Generated ${res.data.images.length} images`, 'success');
            }
        } catch (error: any) {
            imgNotify(error.response?.data?.error || 'Failed to generate images', 'error');
        } finally { setImgLoading(false); }
    };

    const imgToggleSelection = (imgObj: any) => {
        setImgSelectedImages(prev => {
            const exists = (prev as any[]).some(s => s.src === imgObj.src);
            if (exists) { imgNotify('Image removed', 'info'); return (prev as any[]).filter(s => s.src !== imgObj.src); }
            imgNotify('Image added', 'success');
            return [...(prev as any[]), imgObj];
        });
    };

    const imgHandleDownloadBlob = async (endpoint: string, filename: string) => {
        if (imgSelectedImages.length === 0) return;
        setImgLoading(true); setImgLoadingText(`Preparing ${filename}...`);
        try {
            const res = await client.post(endpoint, { images: imgSelectedImages }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            imgNotify(`${filename} downloaded!`, 'success');
        } catch { imgNotify(`Failed to export ${filename}`, 'error'); }
        finally { setImgLoading(false); }
    };

    const imageState = {
        isDragging: imgIsDragging, uploadStatus: imgUploadStatus, currentChapter: imgCurrentChapter,
        activeTab: imgActiveTab, imagesByChapter: imgImagesByChapter, selectedImages: imgSelectedImages,
        aiPrompt: imgAiPrompt, aiNum: imgAiNum, aiImages: imgAiImages,
        loading: imgLoading, loadingText: imgLoadingText, lightboxImage: imgLightboxImage,
        notifications: imgNotifications,
    };

    const imageHandlers = {
        handleDragOver: (e: any) => { e.preventDefault(); setImgIsDragging(true); },
        handleDragLeave: () => setImgIsDragging(false),
        handleDrop: (e: any) => { e.preventDefault(); setImgIsDragging(false); imgProcessUpload(e.dataTransfer.files[0]); },
        handleFileInput: (e: any) => { imgProcessUpload(e.target.files[0]); e.target.value = ''; },
        setCurrentChapter: setImgCurrentChapter, setActiveTab: setImgActiveTab,
        setAiPrompt: setImgAiPrompt, setAiNum: setImgAiNum,
        generateAiImages: imgGenerateAi,
        toggleImageSelection: imgToggleSelection,
        removeSelectedImage: (imgObj: any) => { setImgSelectedImages(prev => (prev as any[]).filter(s => s.src !== imgObj.src)); imgNotify('Image removed', 'info'); },
        setLightboxImage: setImgLightboxImage,
        exportZip: () => imgHandleDownloadBlob('/image-extractor/export-zip', 'selected_images.zip'),
        exportPDF: () => imgHandleDownloadBlob('/image-extractor/export-pdf', 'selected_images.pdf'),
    };

    return { imageState, imageHandlers };
}
