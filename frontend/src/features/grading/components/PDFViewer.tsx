import { useEffect, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import AnnotationLayer from './AnnotationLayer';
import LabelEditor, { AnnotationData } from './LabelEditor';
import Toolbar from './Toolbar';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Always use react-pdf's bundled worker to keep API/Worker versions aligned.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
interface PDFViewerProps {
    file?: string;
    annotations?: AnnotationData[];
    onSaveAnnotation?: (annotation: AnnotationData) => Promise<AnnotationData | null>;
    onDeleteAnnotation?: (id: string) => Promise<void>;
}

export default function PDFViewer({ file, annotations = [], onSaveAnnotation, onDeleteAnnotation }: PDFViewerProps) {
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

    const separator = file?.includes('?') ? '&' : '?';
    const resolvedFile = file
        ? `${file}${separator}pdf_retry=${loadRetry}`
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
            <Toolbar
                pageNumber={pageNumber}
                numPages={numPages}
                scale={scale}
                isPlacingLabel={isPlacingLabel}
                onPrev={() => setPageNumber((p) => Math.max(1, p - 1))}
                onNext={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}
                onScaleChange={setScale}
                onToggleLabel={() => {
                    setIsPlacingLabel((v) => !v);
                    setLocalError('');
                }}
            />

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

                        {activeAnnotation?.pageNumber === pageNumber && (
                            <LabelEditor
                                annotation={activeAnnotation}
                                saving={saving}
                                localError={localError}
                                onChangeAnnotation={setActiveAnnotation}
                                onSave={handleSaveTag}
                                onDelete={handleDeleteTag}
                                onClose={() => {
                                    setActiveAnnotation(null);
                                    setLocalError('');
                                }}
                            />
                        )}
                    </div>
                ) : (
                    <div style={{ padding: 20 }}>No PDF selected.</div>
                )}
            </div>
        </div>
    );
}


