import { useEffect, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import AnnotationLayer from './AnnotationLayer';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Always use react-pdf's bundled worker to keep API/Worker versions aligned.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function PDFViewer({ file, annotations = [], onSaveAnnotation, onDeleteAnnotation }) {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1);
    const [activeAnnotation, setActiveAnnotation] = useState(null);
    const [isPlacingLabel, setIsPlacingLabel] = useState(false);
    const [saving, setSaving] = useState(false);
    const [localError, setLocalError] = useState('');
    const [pdfLoadError, setPdfLoadError] = useState('');
    const [loadRetry, setLoadRetry] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef(null);

    // Measure container width for auto-fit
    const measureWidth = useCallback(() => {
        if (containerRef.current) {
            const w = containerRef.current.clientWidth - 24; // subtract padding
            if (w > 0) setContainerWidth(w);
        }
    }, []);

    useEffect(() => {
        measureWidth();
        const ro = new ResizeObserver(measureWidth);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [measureWidth]);

    useEffect(() => {
        setPageNumber(1);
        setActiveAnnotation(null);
        setIsPlacingLabel(false);
        setLocalError('');
        setPdfLoadError('');
        setLoadRetry(0);
    }, [file]);

    const resolvedFile = file
        ? `${file}${file.includes('?') ? '&' : '?'}pdf_retry=${loadRetry}`
        : file;

    const handlePageClick = (event, pageNum) => {
        if (!onSaveAnnotation || !isPlacingLabel) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        setActiveAnnotation({
            pageNumber: pageNum,
            x,
            y,
            title: '',
            comment: '',
            aiSuggestion: '',
            timestamp: new Date().toISOString(),
        });
        setIsPlacingLabel(false);
        setLocalError('');
    };

    const handleSaveTag = async () => {
        if (!activeAnnotation || !onSaveAnnotation) return;
        if (!activeAnnotation.comment?.trim()) {
            setLocalError('请填写标签内容（例如老师评语）后再保存。');
            return;
        }

        try {
            setSaving(true);
            setLocalError('');
            const saved = await onSaveAnnotation({
                ...activeAnnotation,
                comment: activeAnnotation.comment.trim(),
                title: (activeAnnotation.title || '').trim(),
            });
            if (saved) {
                setActiveAnnotation(null);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTag = async () => {
        if (!activeAnnotation?.id || !onDeleteAnnotation) return;
        await onDeleteAnnotation(activeAnnotation.id);
        setActiveAnnotation(null);
        setLocalError('');
    };

    const visibleAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);
    const hasPendingNewLabel = activeAnnotation && !activeAnnotation.id && activeAnnotation.pageNumber === pageNumber;
    const renderAnnotations = hasPendingNewLabel
        ? [...visibleAnnotations, { ...activeAnnotation, id: '__pending_label__' }]
        : visibleAnnotations;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    disabled={pageNumber <= 1}
                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', minWidth: 56 }}
                >
                    Prev
                </button>
                <span style={{ fontSize: 14, minWidth: 106, textAlign: 'center' }}>Page {pageNumber} / {numPages || '?'}</span>
                <button
                    type="button"
                    disabled={!numPages || pageNumber >= numPages}
                    onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', minWidth: 56 }}
                >
                    Next
                </button>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 2 }}>Zoom</span>
                <select
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    style={{ width: 96, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
                >
                    {zoomLevels.map((z) => <option key={z} value={z}>{z === 1 ? 'Fit Width' : `${Math.round(z * 100)}%`}</option>)}
                </select>
                <button
                    type="button"
                    onClick={() => {
                        setIsPlacingLabel((v) => !v);
                        setLocalError('');
                    }}
                    style={{
                        padding: '7px 12px',
                        borderRadius: 999,
                        border: isPlacingLabel ? '1px solid #0f766e' : '1px solid #cbd5e1',
                        background: isPlacingLabel ? '#0f766e' : '#fff',
                        color: isPlacingLabel ? '#fff' : '#0f172a',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    {isPlacingLabel ? 'Click PDF To Place Label' : 'Add Label Comment'}
                </button>
                <span style={{ fontSize: 12, color: isPlacingLabel ? '#0f766e' : '#64748b', marginLeft: 2 }}>
                    {isPlacingLabel ? '放置模式已开启：点击 PDF 任意位置落点' : '先点击 Add Label Comment 再放置标签'}
                </span>
            </div>

            <div
                ref={containerRef}
                style={{
                    flex: 1,
                    position: 'relative',
                    border: isPlacingLabel ? '1px solid #0f766e' : '1px solid #e5e7eb',
                    borderRadius: 8,
                    overflow: 'auto',
                    minHeight: 0,
                    padding: 12,
                    cursor: isPlacingLabel ? 'crosshair' : 'default',
                    boxShadow: isPlacingLabel ? '0 0 0 3px rgba(15,118,110,0.15)' : 'none',
                }}
            >
                {file ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <Document
                            file={resolvedFile}
                            onLoadSuccess={({ numPages: n }) => {
                                setNumPages(n);
                                setPdfLoadError('');
                            }}
                            onLoadError={(err) => {
                                setPdfLoadError(`PDF load failed: ${err?.message || 'network error'}`);
                                // Network transport can be flaky; retry once with a fresh cache-busting URL.
                                setLoadRetry((prev) => (prev < 1 ? prev + 1 : prev));
                            }}
                            loading={<div style={{ padding: 20 }}>Loading PDF...</div>}
                        >
                            <Page
                                pageNumber={pageNumber}
                                width={containerWidth > 0 ? containerWidth * scale : undefined}
                                onClick={(e) => handlePageClick(e, pageNumber)}
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                            />
                        </Document>
                        {pdfLoadError && (
                            <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>
                                {pdfLoadError}
                            </div>
                        )}
                        <AnnotationLayer
                            annotations={renderAnnotations}
                            selectedId={activeAnnotation?.id || (hasPendingNewLabel ? '__pending_label__' : null)}
                            onSelect={setActiveAnnotation}
                        />

                        {activeAnnotation && activeAnnotation.pageNumber === pageNumber && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    width: 320,
                                    maxWidth: 'calc(100% - 24px)',
                                    border: '1px solid #d1d5db',
                                    borderRadius: 10,
                                    padding: 12,
                                    background: 'rgba(248, 250, 252, 0.96)',
                                    display: 'grid',
                                    gap: 8,
                                    backdropFilter: 'blur(4px)',
                                    zIndex: 20,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong style={{ fontSize: 14 }}>Label Editor</strong>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>Page {activeAnnotation.pageNumber}</span>
                                </div>
                                <input
                                    placeholder="Label title (optional)"
                                    value={activeAnnotation.title || ''}
                                    onChange={(e) => setActiveAnnotation((prev) => ({ ...prev, title: e.target.value }))}
                                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
                                />
                                <textarea
                                    placeholder="Write teacher feedback here..."
                                    value={activeAnnotation.comment || ''}
                                    rows={4}
                                    onChange={(e) => setActiveAnnotation((prev) => ({ ...prev, comment: e.target.value }))}
                                    style={{ padding: 10, borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical', background: '#fff' }}
                                />
                                {localError && <div style={{ color: '#b91c1c', fontSize: 12 }}>{localError}</div>}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveAnnotation(null);
                                            setLocalError('');
                                        }}
                                        style={{ padding: '8px 12px', border: '1px solid #cbd5e1', color: '#334155', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
                                    >
                                        Close
                                    </button>
                                    {activeAnnotation.id && (
                                        <button type="button" onClick={handleDeleteTag} style={{ padding: '8px 12px', border: '1px solid #ef4444', color: '#b91c1c', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                                            Delete
                                        </button>
                                    )}
                                    <button type="button" onClick={handleSaveTag} disabled={saving} style={{ padding: '8px 12px', border: 'none', color: '#fff', background: '#0f766e', borderRadius: 6, cursor: 'pointer' }}>
                                        {saving ? 'Saving...' : 'Save Label'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: 20 }}>No PDF selected.</div>
                )}
            </div>
        </div>
    );
}
