import { useState, useRef, useCallback } from 'react';
import client from '@/shared/api/client';
import { extractErrorMessage } from '@/shared/utils/extractError';

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
            style.includes('display:none') || style.includes('display: none') ||
            style.includes('visibility:hidden') || style.includes('visibility: hidden')
        ) return false;
        current = current.parentNode;
    }
    return true;
};

/**
 * Parse inline <style> blocks from the SVG and return CSS selectors that
 * set display:none or visibility:hidden.  DOMParser documents are not rendered
 * so getComputedStyle() is unavailable; we replicate it manually.
 */
function buildHiddenCssSelectors(doc: Document): Set<string> {
    const hidden = new Set<string>();
    doc.querySelectorAll('style').forEach((styleEl) => {
        const css = (styleEl.textContent || '').replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
        const ruleRe = /([^{]+)\{([^}]*)\}/g;
        let m: RegExpExecArray | null;
        while ((m = ruleRe.exec(css)) !== null) {
            const declarations = m[2];
            if (/display\s*:\s*none/i.test(declarations) || /visibility\s*:\s*hidden/i.test(declarations)) {
                m[1].split(',').forEach((sel) => {
                    const trimmed = sel.trim();
                    if (trimmed) hidden.add(trimmed);
                });
            }
        }
    });
    return hidden;
}

/**
 * Returns true if the element or any ancestor (up to <svg>) matches a
 * CSS selector that hides elements.
 */
function isHiddenByCss(el: Element, hiddenSelectors: Set<string>): boolean {
    if (hiddenSelectors.size === 0) return false;
    let current: Element | null = el;
    while (current && current.tagName.toLowerCase() !== 'svg') {
        for (const sel of hiddenSelectors) {
            try {
                if (current.matches(sel)) return true;
            } catch { /* malformed selector — skip */ }
        }
        current = current.parentElement;
    }
    return false;
}

/**
 * SVG <switch> renders only the FIRST child whose conditional attributes
 * (systemLanguage, requiredFeatures, requiredExtensions) evaluate to true,
 * OR the first child without any such attributes as the default.
 * DOMParser does NOT apply this rule — all children are present in the DOM.
 * We must filter out language-specific <switch> variants manually.
 *
 * Returns true if the element is inside a non-default branch of a <switch>.
 */
function isInsideUnrenderedSwitchBranch(el: Element): boolean {
    let current: Element | null = el;
    while (current && current.tagName.toLowerCase() !== 'svg') {
        const parent = current.parentElement;
        if (parent && parent.tagName.toLowerCase() === 'switch') {
            // current is a direct child of <switch>
            const hasCondition = (
                current.hasAttribute('systemLanguage') ||
                current.hasAttribute('requiredFeatures') ||
                current.hasAttribute('requiredExtensions')
            );
            if (hasCondition) return true; // language/feature-specific variant → skip
            // current is the default branch → keep it
            return false;
        }
        current = parent;
    }
    return false;
}

function collectEditableTextNodes(doc: Document) {
    const hiddenCssSelectors = buildHiddenCssSelectors(doc);

    // defs/symbol: do NOT block — draw.io/Lucidchart defines text in <symbol>
    // clipPath/mask/script/metadata: always block, they're never user-visible text
    const isStructurallyBlocked = (el: Element) =>
        !!el.closest('clipPath, mask, pattern, style, script, metadata');

    // Icon-font PUA characters look like boxes/garbled in text inputs
    const isPuaOnly = (text: string) => /^[\uE000-\uF8FF\s]+$/.test(text);

    const picked: Element[] = [];
    const seen = new Set<Element>();

    const maybePush = (el: Element) => {
        if (!el || seen.has(el)) return;
        const text = normalizeText(el.textContent);
        if (!text || isPuaOnly(text)) return;
        if (isStructurallyBlocked(el)) return;
        if (!isVisibleSvgNode(el)) return;
        if (isHiddenByCss(el, hiddenCssSelectors)) return;
        if (isInsideUnrenderedSwitchBranch(el)) return;
        seen.add(el);
        picked.push(el);
    };

    // Pass 1: leaf tspan / textPath (most precise — draw.io, Mermaid, Lucidchart)
    Array.from(doc.querySelectorAll('tspan, textPath')).forEach((el) => {
        if (Array.from(el.children).length === 0) maybePush(el);
    });

    // Pass 2: bare <text> elements with no tspan/textPath children
    // Always independent of Pass 1 — fixes plain-text SVGs losing all labels
    Array.from(doc.querySelectorAll('text')).forEach((el) => {
        if (!el.querySelector('tspan, textPath')) maybePush(el);
    });

    // Pass 3: HTML leaf nodes inside <foreignObject>
    Array.from(doc.querySelectorAll('foreignObject *')).forEach((el) => {
        if (Array.from(el.children).length === 0) maybePush(el);
    });

    // Pass 4: SVG 1.2 flowRoot / flowPara (Inkscape sometimes uses these)
    Array.from(doc.querySelectorAll('flowRoot, flowPara')).forEach((el) => {
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

    const handleExtractUpload = async (incoming?: File | Event | null) => {
        const fileToUpload = incoming instanceof File ? incoming : extractFile;
        if (!fileToUpload) {
            setExtractError('Please select a file first.');
            return;
        }
        setExtractLoading(true); setExtractError('');
        const formData = new FormData();
        formData.append('file', fileToUpload);
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

            // If no text nodes found, detect whether this is a path-only SVG (outlined text)
            // so we can show a meaningful explanation instead of a blank fields panel.
            if (validNodes.length === 0) {
                const hasTextTags = doc.querySelector('text, tspan, textPath') !== null;
                const hasPathsOnly = !hasTextTags && doc.querySelectorAll('path').length > 0;
                const hint = hasPathsOnly
                    ? 'This SVG uses outlined paths for text (no editable text nodes). Try a different SVG.'
                    : 'No editable text fields found in this SVG.';
                // Still open the editor so the user can preview; note is shown in fields panel
                const fields: any[] = [{ id: 0, value: hint, _readonly: true }];
                setEditorFields(fields);
            } else {
                const fields = validNodes.map((n, i) => ({ id: i, value: normalizeText(n.textContent) }));
                setEditorFields(fields);
            }
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
        updatePreviewHtml();
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
            handleTransferFile: async (file: File) => {
                setExtractFile(file);
                await handleExtractUpload(file);
            },
            injectExtractResult: (data: any) => {
                setExtractData(data);
                setExtractError('');
            },
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
