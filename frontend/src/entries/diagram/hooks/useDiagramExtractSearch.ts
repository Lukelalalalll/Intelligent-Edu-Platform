import { useState, useRef, useCallback } from 'react';
import client from '../../../api/client';

function extractErrorMessage(err: any): string {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
    }
    if (typeof detail === 'string' && detail.trim()) return detail;
    return err?.response?.data?.error || err?.message || 'Unknown error';
}

const normalizeText = (value: any) => String(value || '').replace(/\s+/g, ' ').trim();

const isVisibleSvgNode = (el: any) => {
    let current = el;
    while (current && current.getAttribute) {
        const display = (current.getAttribute('display') || '').toLowerCase();
        const visibility = (current.getAttribute('visibility') || '').toLowerCase();
        const opacity = (current.getAttribute('opacity') || '').toLowerCase();
        const style = (current.getAttribute('style') || '').toLowerCase();
        if (
            display === 'none' || visibility === 'hidden' || opacity === '0' ||
            style.includes('display:none') || style.includes('visibility:hidden')
        ) return false;
        current = current.parentNode;
    }
    return true;
};

function collectEditableTextNodes(doc: Document) {
    const isBlocked = (el: Element) => !!el.closest('defs, symbol, clipPath, mask, pattern, style, script, metadata');
    const picked: Element[] = [];
    const seen = new Set<Element>();

    const maybePush = (el: Element) => {
        if (!el || seen.has(el)) return;
        const text = normalizeText(el.textContent);
        if (!text || isBlocked(el) || !isVisibleSvgNode(el)) return;
        seen.add(el);
        picked.push(el);
    };

    Array.from(doc.querySelectorAll('tspan, textPath')).forEach((el) => {
        if (Array.from(el.children).length === 0) maybePush(el);
    });

    if (picked.length === 0) {
        Array.from(doc.querySelectorAll('text')).forEach((el) => maybePush(el));
    }

    Array.from(doc.querySelectorAll('foreignObject *')).forEach((el) => {
        if (Array.from(el.children).length === 0) maybePush(el);
    });

    return picked;
}

export function useDiagramExtractSearch() {
    // Extract
    const [extractFile, setExtractFile] = useState(null);
    const [isExtractDragging, setIsExtractDragging] = useState(false);
    const [extractLoading, setExtractLoading] = useState(false);
    const [extractData, setExtractData] = useState(null);
    const [extractError, setExtractError] = useState('');

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [searchError, setSearchError] = useState('');

    // Editor
    const [isEditorVisible, setIsEditorVisible] = useState(false);
    const [editorLoading, setEditorLoading] = useState(false);
    const [editorError, setEditorError] = useState('');
    const [editorFields, setEditorFields] = useState([]);
    const [previewHtml, setPreviewHtml] = useState('');

    const svgDocRef = useRef<Document | null>(null);
    const textNodesRef = useRef<Element[]>([]);

    const handleExtractUpload = async () => {
        setExtractLoading(true); setExtractError('');
        const formData = new FormData();
        formData.append('file', extractFile);
        try {
            const res = await client.post('/diagram/upload_document', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setExtractData(res.data);
        } catch (err) {
            setExtractError(extractErrorMessage(err));
        } finally {
            setExtractLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!String(searchQuery || '').trim()) { setSearchError('Please enter a search prompt.'); return; }
        setSearchLoading(true); setSearchError(''); setIsEditorVisible(false);
        try {
            const res = await client.post('/diagram/search_svg', { prompt: searchQuery });
            setSearchResults(res.data);
        } catch (err) {
            setSearchError(extractErrorMessage(err));
        } finally {
            setSearchLoading(false);
        }
    };

    const updatePreviewHtml = useCallback(() => {
        if (!svgDocRef.current) return;
        const svgStr = new XMLSerializer().serializeToString(svgDocRef.current);
        setPreviewHtml(`<!DOCTYPE html><html><head><style>body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }</style></head><body>${svgStr}</body></html>`);
    }, []);

    const loadEditor = async (url: string) => {
        setIsEditorVisible(true); setEditorLoading(true); setEditorError('');
        try {
            const res = await client.get(`/diagram/fetch_external_svg?url=${encodeURIComponent(url)}`, { responseType: 'text' });
            const parser = new DOMParser();
            const doc = parser.parseFromString(res.data, 'image/svg+xml');
            if (doc.querySelector('parsererror')) throw new Error('Failed to parse SVG file');

            const validNodes = collectEditableTextNodes(doc);
            svgDocRef.current = doc;
            textNodesRef.current = validNodes;

            const fields = validNodes.map((n, i) => ({ id: i, value: normalizeText(n.textContent) }));
            setEditorFields(fields);
            updatePreviewHtml();
        } catch (err) {
            setEditorError(extractErrorMessage(err));
        } finally {
            setEditorLoading(false);
        }
    };

    const handleEditorFieldChange = (idx: number, val: string) => {
        const newFields = [...editorFields];
        newFields[idx].value = val;
        setEditorFields(newFields);
        if (textNodesRef.current[idx]) {
            textNodesRef.current[idx].textContent = val;
        }
    };

    const handleEditorRemoveField = (idx: number) => {
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
            const res = await client.post('/diagram/download_svg', { svg: svgStr }, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'edited.svg';
            a.click(); URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Error downloading SVG: ' + err.message);
        }
    };

    return {
        extractState: { file: extractFile, isDragging: isExtractDragging, loading: extractLoading, data: extractData, error: extractError },
        extractHandlers: {
            handleFileChange: (e: any) => setExtractFile(e.target.files[0]),
            handleDragOver: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsExtractDragging(true); },
            handleDragLeave: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsExtractDragging(false); },
            handleDrop: (e: any) => { e.preventDefault(); e.stopPropagation(); setIsExtractDragging(false); if (e.dataTransfer.files[0]) setExtractFile(e.dataTransfer.files[0]); },
            handleUpload: handleExtractUpload,
        },
        searchState: { query: searchQuery, setQuery: setSearchQuery, loading: searchLoading, results: searchResults, error: searchError },
        searchHandlers: { handleSearch },
        editorState: { isVisible: isEditorVisible, loading: editorLoading, fields: editorFields, previewHtml, error: editorError },
        editorHandlers: {
            loadEditor, handleFieldChange: handleEditorFieldChange, handleRemoveField: handleEditorRemoveField,
            applyChanges: updatePreviewHtml, downloadSvg, setIsVisible: setIsEditorVisible,
        },
    };
}
