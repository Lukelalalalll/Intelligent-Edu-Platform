// frontend/entries/sub4/diagramToolEntry.jsx

import React, { useState, useRef } from 'react';
import client from '../../api/client';
import DiagramToolPage from '../../pages/sub4/DiagramTool';

export default function DiagramToolEntry() {
    // === 1. Extract State ===
    const [extractFile, setExtractFile] = useState(null);
    const [isExtractDragging, setIsExtractDragging] = useState(false);
    const [extractLoading, setExtractLoading] = useState(false);
    const [extractData, setExtractData] = useState(null);
    const [extractError, setExtractError] = useState('');

    // === 2. Search State ===
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [searchError, setSearchError] = useState('');

    // === 3. Editor State ===
    const [isEditorVisible, setIsEditorVisible] = useState(false);
    const [editorLoading, setEditorLoading] = useState(false);
    const [editorError, setEditorError] = useState('');
    const [editorFields, setEditorFields] = useState([]);
    const [previewHtml, setPreviewHtml] = useState('');

    // 核心：使用 useRef 保存解析后的 XML DOM 树
    const svgDocRef = useRef(null);
    const textNodesRef = useRef([]);

    // === 4. Generate State ===
    const [genFile, setGenFile] = useState(null);
    const [isGenDragging, setIsGenDragging] = useState(false);
    const [genLoading, setGenLoading] = useState(false);
    const [genData, setGenData] = useState(null);
    const [genError, setGenError] = useState('');

    // === 5. Modal State ===
    const [modal, setModal] = useState({ isOpen: false, imgSrc: '', pageNum: '' });

    // --- Helpers ---
    const handleDrag = (e, setDrag) => { e.preventDefault(); e.stopPropagation(); setDrag(true); };
    const handleLeave = (e, setDrag) => { e.preventDefault(); e.stopPropagation(); setDrag(false); };
    const handleDrop = (e, setDrag, setFile) => { e.preventDefault(); e.stopPropagation(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); };

    // --- Extract Logic ---
    const handleExtractUpload = async () => {
        setExtractLoading(true); setExtractError('');
        const formData = new FormData();
        formData.append('file', extractFile);
        try {
            // 注意：这里需要你后端的 API 对应为 /sub4/upload_document
            const res = await client.post('/sub4/upload_document', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
            setExtractData(res.data);
        } catch (err) {
            setExtractError(err.response?.data?.error || err.message);
        } finally {
            setExtractLoading(false);
        }
    };

    // --- Search & Editor Logic ---
    const handleSearch = async () => {
        setSearchLoading(true); setSearchError(''); setIsEditorVisible(false);
        try {
            const res = await client.post('/sub4/search_svg', { prompt: searchQuery });
            setSearchResults(res.data);
        } catch (err) {
            setSearchError(err.response?.data?.error || err.message);
        } finally {
            setSearchLoading(false);
        }
    };

    const loadEditor = async (url) => {
        setIsEditorVisible(true); setEditorLoading(true); setEditorError('');
        try {
            const res = await client.get(`/sub4/fetch_external_svg?url=${encodeURIComponent(url)}`, { responseType: 'text' });
            const parser = new DOMParser();
            const doc = parser.parseFromString(res.data, 'image/svg+xml');

            if (doc.querySelector('parsererror')) throw new Error('Failed to parse SVG file');

            const isVisible = (el) => {
                let current = el;
                while (current && current.getAttribute) {
                    if (current.getAttribute('display') === 'none' || current.getAttribute('visibility') === 'hidden' || current.getAttribute('opacity') === '0') return false;
                    current = current.parentNode;
                }
                return true;
            };

            const candidates = Array.from(doc.querySelectorAll('text, tspan, textPath'));
            const validNodes = candidates.filter(el => {
                const cleanText = (el.textContent || '').trim();
                if (!cleanText || !isVisible(el) || el.closest('defs, symbol, clipPath, mask, pattern, style')) return false;
                if (cleanText.length === 1 && cleanText.charCodeAt(0) > 126) return false; // 排除图标
                const hasTextChildren = Array.from(el.children).some(child => ['tspan', 'text', 'textPath'].includes(child.tagName.toLowerCase()));
                if (hasTextChildren) return false;
                return true;
            });

            svgDocRef.current = doc;
            textNodesRef.current = validNodes;

            const fields = validNodes.map((n, i) => ({ id: i, value: n.textContent }));
            setEditorFields(fields);
            updatePreviewHtml();
        } catch (err) {
            setEditorError(err.response?.data?.error || err.message);
        } finally {
            setEditorLoading(false);
        }
    };

    const updatePreviewHtml = () => {
        if (!svgDocRef.current) return;
        const svgStr = new XMLSerializer().serializeToString(svgDocRef.current);
        setPreviewHtml(`<!DOCTYPE html><html><head><style>body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }</style></head><body>${svgStr}</body></html>`);
    };

    const handleEditorFieldChange = (idx, val) => {
        const newFields = [...editorFields];
        newFields[idx].value = val;
        setEditorFields(newFields);

        // 同步修改 DOM 树中的文本节点
        if (textNodesRef.current[idx]) {
            textNodesRef.current[idx].textContent = val;
        }
    };

    const handleEditorRemoveField = (idx) => {
        if (textNodesRef.current[idx]) textNodesRef.current[idx].remove();
        textNodesRef.current.splice(idx, 1);

        const newFields = editorFields.filter((_, i) => i !== idx).map((f, i) => ({ ...f, id: i }));
        setEditorFields(newFields);
        updatePreviewHtml();
    };

    const downloadSvg = async () => {
        if (!svgDocRef.current) return;
        const svgStr = new XMLSerializer().serializeToString(svgDocRef.current);
        try {
            const res = await client.post('/sub4/download_svg', { svg: svgStr }, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'edited.svg';
            a.click(); URL.revokeObjectURL(url);
        } catch (err) {
            alert('Error downloading SVG: ' + err.message);
        }
    };

    // --- Generate Logic ---
    const handleGenerate = async () => {
        setGenLoading(true); setGenError('');
        const formData = new FormData();
        formData.append('promptFile', genFile);
        try {
            const res = await client.post('/sub4/generate_diagram', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
            setGenData(res.data);
        } catch (err) {
            setGenError(err.response?.data?.error || err.message);
        } finally {
            setGenLoading(false);
        }
    };

    // --- Page Props Mapping ---
    return <DiagramToolPage
        extractState={{ file: extractFile, isDragging: isExtractDragging, loading: extractLoading, data: extractData, error: extractError }}
        extractHandlers={{
            handleFileChange: (e) => setExtractFile(e.target.files[0]),
            handleDragOver: (e) => handleDrag(e, setIsExtractDragging),
            handleDragLeave: (e) => handleLeave(e, setIsExtractDragging),
            handleDrop: (e) => handleDrop(e, setIsExtractDragging, setExtractFile),
            handleUpload: handleExtractUpload
        }}
        searchState={{ query: searchQuery, setQuery: setSearchQuery, loading: searchLoading, results: searchResults, error: searchError }}
        searchHandlers={{ handleSearch }}
        genState={{ file: genFile, isDragging: isGenDragging, loading: genLoading, data: genData, error: genError }}
        genHandlers={{
            handleFileChange: (e) => setGenFile(e.target.files[0]),
            handleDragOver: (e) => handleDrag(e, setIsGenDragging),
            handleDragLeave: (e) => handleLeave(e, setIsGenDragging),
            handleDrop: (e) => handleDrop(e, setIsGenDragging, setGenFile),
            handleGenerate
        }}
        editorState={{ isVisible: isEditorVisible, loading: editorLoading, fields: editorFields, previewHtml, error: editorError }}
        editorHandlers={{ loadEditor, handleFieldChange: handleEditorFieldChange, handleRemoveField: handleEditorRemoveField, applyChanges: updatePreviewHtml, downloadSvg, setIsVisible: setIsEditorVisible }}
        modalState={modal}
        modalHandlers={{
            openModal: (imgSrc, pageNum) => { setModal({ isOpen: true, imgSrc, pageNum }); document.body.style.overflow = 'hidden'; },
            closeModal: () => { setModal({ isOpen: false, imgSrc: '', pageNum: '' }); document.body.style.overflow = ''; },
            downloadImage: () => {
                const a = document.createElement('a'); a.href = modal.imgSrc;
                a.download = `extracted_page_${modal.pageNum || 'img'}.png`;
                a.click();
            }
        }}
    />;
}