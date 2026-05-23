import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    PdfLoader,
    PdfHighlighter,
} from 'react-pdf-highlighter';
import 'react-pdf-highlighter/dist/esm/style/PdfHighlighter.css';
import 'react-pdf-highlighter/dist/esm/style/Highlight.css';
import 'react-pdf-highlighter/dist/esm/style/Tip.css';
import 'react-pdf-highlighter/dist/esm/style/pdf_viewer.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import styles from '../styles/StudyRoom.module.css';

// Worker served locally to avoid CDN blocks (copied from react-pdf-highlighter's bundled pdfjs-dist 2.16.105)
const WORKER_URL = '/pdf.worker.2.16.105.min.js';

// Stable references so PdfHighlighter (PureComponent) never re-renders unnecessarily
const AREA_SEL_OFF = () => false;
const NOOP = () => {};
const NULL_TRANSFORM = () => null as any;
const EMPTY_HIGHLIGHTS: any[] = [];

/**
 * Tiny bridge component: receives pdfDocument from PdfLoader's render-prop
 * and notifies the parent via useEffect (never calling setState during render).
 */
interface PdfDocBridgeProps {
    pdfDocument: any;
    onLoad: (pdfDocument: any) => void;
    renderSelectionTip: (...args: any[]) => React.ReactElement | null;
}

const PdfDocBridge = React.memo(function PdfDocBridge({ pdfDocument, onLoad, renderSelectionTip }: PdfDocBridgeProps) {
    useEffect(() => { onLoad(pdfDocument); }, [pdfDocument, onLoad]);
    return (
        <PdfHighlighter
            pdfDocument={pdfDocument}
            enableAreaSelection={AREA_SEL_OFF}
            onScrollChange={NOOP}
            scrollRef={NOOP}
            onSelectionFinished={renderSelectionTip}
            highlightTransform={NULL_TRANSFORM}
            highlights={EMPTY_HIGHLIGHTS}
        />
    );
});

/**
 * Extract all text from a PDFDocumentProxy (for AI context).
 */
const MAX_EXTRACT_PAGES = 30;

async function extractAllText(pdfDocument: any) {
    const pages: string[] = [];
    const limit = Math.min(pdfDocument.numPages, MAX_EXTRACT_PAGES);
    for (let i = 1; i <= limit; i++) {
        const page = await pdfDocument.getPage(i);
        const tc = await page.getTextContent();
        // Detect line breaks by comparing y-coordinates of consecutive items.
        // tc.items[].transform = [scaleX, skewX, skewY, scaleY, x, y]
        let lastY = null;
        const parts: string[] = [];
        for (const item of tc.items) {
            if (!item.str) continue;
            const y = item.transform?.[5];
            if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
                parts.push('\n');
            } else if (parts.length > 0) {
                parts.push(' ');
            }
            parts.push(item.str);
            if (y !== undefined) lastY = y;
        }
        pages.push(parts.join(''));
    }
    return pages.join('\n\n');
}

interface PdfViewerProps {
    file?: File | null;
    fileType?: string;
    onHighlight?: (text: string, mode: string) => void;
    onClose?: () => void;
    onAddNote?: (note: { content: string; color: string; highlightedText: string }) => void;
    onTextExtracted?: (text: string) => void;
}

export default function PdfViewer({ file, fileType, onHighlight, onClose, onAddNote, onTextExtracted }: PdfViewerProps) {
    const [popover, setPopover] = useState<{ text: string; x: number; y: number } | null>(null); // for MD mode
    const mdRef = useRef<HTMLDivElement>(null);
    const viewerBodyRef = useRef<HTMLDivElement>(null);
    const textExtractedRef = useRef(false);
    const pdfDocRef = useRef<any>(null); // stable ref to avoid render-fn side effects
    const [currentPage, setCurrentPage] = useState(1);
    const currentPageRef = useRef(1);
    const [totalPages, setTotalPages] = useState(0);
    const pdfWrapRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // Reset extraction flag when file changes so new documents get extracted
    useEffect(() => {
        textExtractedRef.current = false;
        pdfDocRef.current = null;
        setCurrentPage(1);
        currentPageRef.current = 1;
        setTotalPages(0);
    }, [file, fileType]);

    // IntersectionObserver to track current visible page in the PDF
    useEffect(() => {
        if (fileType !== 'pdf' || !totalPages) return;
        const wrap = pdfWrapRef.current;
        if (!wrap) return;

        // Small delay to let pages render
        const timer = setTimeout(() => {
            const pages = wrap.querySelectorAll('.page');
            if (!pages.length) return;

            observerRef.current = new IntersectionObserver(
                (entries) => {
                    let bestPage = currentPageRef.current;
                    let bestRatio = 0;
                    for (const entry of entries) {
                        if (entry.intersectionRatio > bestRatio) {
                            bestRatio = entry.intersectionRatio;
                            const num = Number.parseInt((entry.target as HTMLElement).dataset.pageNumber ?? '', 10);
                            if (num) bestPage = num;
                        }
                    }
                    if (bestRatio > 0) {
                        setCurrentPage(bestPage);
                        currentPageRef.current = bestPage;
                    }
                },
                { root: wrap.querySelector('.PdfHighlighter') || wrap, threshold: [0, 0.25, 0.5, 0.75] }
            );
            pages.forEach(p => observerRef.current?.observe(p));
        }, 500);

        return () => {
            clearTimeout(timer);
            if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
        };
    }, [fileType, totalPages]);

    // Create object URL for PDF (useState+useEffect instead of useMemo to survive StrictMode double-mount)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    useEffect(() => {
        if (fileType === 'pdf' && file) {
            const url = URL.createObjectURL(file);
            setPdfUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                setPdfUrl(null);
            };
        }
        setPdfUrl(null);
    }, [file, fileType]);

    // Called when PdfLoader delivers the document — stored in ref, triggered via useEffect
    const handlePdfLoad = useCallback(
        async (pdfDocument) => {
            if (!onTextExtracted || textExtractedRef.current) return;
            textExtractedRef.current = true;
            try {
                const text = await extractAllText(pdfDocument);
                onTextExtracted(text);
            } catch (err) {
                console.error('PDF text extraction failed', err);
            }
        },
        [onTextExtracted],
    );

    // Process pdfDocument handed to us by PdfDocBridge (avoids setState during render)
    const onPdfDocumentLoad = useCallback((pdfDocument) => {
        if (pdfDocRef.current === pdfDocument) return;
        pdfDocRef.current = pdfDocument;
        setTotalPages(pdfDocument.numPages);
        handlePdfLoad(pdfDocument);
    }, [handlePdfLoad]);

    // MD selection handler
    const handleSelectionUp = useCallback(() => {
        const sel = globalThis.getSelection();
        if (!sel || sel.isCollapsed) { setPopover(null); return; }
        const text = sel.toString().trim();
        if (!text || text.length < 3) { setPopover(null); return; }
        const body = viewerBodyRef.current;
        if (!body?.contains(sel.anchorNode)) { setPopover(null); return; }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setPopover({ text, x: rect.left + rect.width / 2, y: rect.top - 10 });
    }, []);

    // Dismiss popover (MD mode)
    useEffect(() => {
        const dismiss = (e) => {
            if (e.target.closest(`.${styles.selPopover}`)) return;
            setPopover(null);
        };
        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
    }, []);

    const handlePopoverAction = useCallback((mode) => {
        if (!popover) return;
        const text = popover.text;
        setPopover(null);
        globalThis.getSelection()?.removeAllRanges();
        if (mode === 'note') {
            onAddNote?.({ content: text, color: 'yellow', highlightedText: text });
        } else {
            onHighlight?.(text, mode);
        }
    }, [popover, onHighlight, onAddNote]);

    // MD rendering
    const [mdHtml, setMdHtml] = useState('');
    useEffect(() => {
        if (fileType === 'md' && file) {
            let cancelled = false;
            file.text().then(text => {
                if (cancelled) return;
                const raw = marked.parse(text || '') as string;
                setMdHtml(DOMPurify.sanitize(raw));
                onTextExtracted?.(text || '');
            });
            return () => { cancelled = true; };
        }
    }, [file, fileType, onTextExtracted]);

    const fileName = file?.name || 'Document';

    // react-pdf-highlighter selection tip (replaces popover for PDF)
    const renderSelectionTip = useCallback(
        (position, content, hideTipAndSelection, transformSelection) => {
            const text = content?.text?.trim();
            if (!text || text.length < 3) return null;
            const doAction = (mode) => {
                hideTipAndSelection();
                if (mode === 'note') {
                    onAddNote?.({ content: text, color: 'yellow', highlightedText: text });
                } else {
                    onHighlight?.(text, mode);
                }
            };
            return (
                <div className={styles.selTipGrid}>
                    <button className={styles.selBtn} onClick={() => doAction('explain')}>
                        <i className="fas fa-lightbulb"></i> Explain
                    </button>
                    <button className={styles.selBtn} onClick={() => doAction('hint')}>
                        <i className="fas fa-search"></i> Hint
                    </button>
                    <button className={styles.selBtn} onClick={() => doAction('quiz')}>
                        <i className="fas fa-question-circle"></i> Quiz
                    </button>
                    <button className={styles.selBtn} onClick={() => doAction('simplify')}>
                        <i className="fas fa-compress-alt"></i> Simplify
                    </button>
                    <button className={styles.selBtn} onClick={() => doAction('expand')}>
                        <i className="fas fa-expand-alt"></i> Expand
                    </button>
                    <button className={`${styles.selBtn} ${styles.selBtnNote}`} onClick={() => doAction('note')}>
                        <i className="fas fa-sticky-note"></i> Note
                    </button>
                </div>
            );
        },
        [onHighlight, onAddNote],
    );

    return (
        <div className={styles.viewerCard}>
            <div className={styles.viewerToolbar}>
                <div className={styles.fileInfo}>
                    <i className={fileType === 'pdf' ? 'fas fa-file-pdf' : 'fas fa-file-alt'}></i>
                    <span>{fileName}</span>
                    {fileType === 'pdf' && totalPages > 0 && (
                        <span className={styles.pageIndicator}>Page {currentPage} / {totalPages}</span>
                    )}
                </div>
                <button className={styles.viewerCloseBtn} onClick={onClose}>
                    <i className="fas fa-times"></i> Close
                </button>
            </div>

            {fileType === 'pdf' && pdfUrl ? (
                <div className={styles.pdfHighlighterWrap} ref={pdfWrapRef}>
                    <PdfLoader
                        url={pdfUrl}
                        workerSrc={WORKER_URL}
                        beforeLoad={
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem', gap: '12px', color: '#888' }}>
                                <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}></i>
                                <span style={{ fontSize: '0.85rem' }}>Loading PDF…</span>
                            </div>
                        }
                        onError={(err) => console.error('PdfLoader error', err)}
                    >
                        {(pdfDocument) => (
                            <PdfDocBridge
                                pdfDocument={pdfDocument}
                                onLoad={onPdfDocumentLoad}
                                renderSelectionTip={renderSelectionTip}
                            />
                        )}
                    </PdfLoader>
                </div>
            ) : (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- text selection area
                <div
                    className={styles.viewerBody}
                    ref={viewerBodyRef}
                    onMouseUp={handleSelectionUp}
                >
                    <div
                        ref={mdRef}
                        className={styles.mdContent}
                        dangerouslySetInnerHTML={{ __html: mdHtml }}
                    />

                    {popover && (
                        <div
                            className={styles.selPopover}
                            style={{ left: `${popover.x}px`, top: `${popover.y}px` }}
                        >
                            <div className={styles.selTipGrid}>
                                <button className={styles.selBtn} onClick={() => handlePopoverAction('explain')}>
                                    <i className="fas fa-lightbulb"></i> Explain
                                </button>
                                <button className={styles.selBtn} onClick={() => handlePopoverAction('hint')}>
                                    <i className="fas fa-search"></i> Hint
                                </button>
                                <button className={styles.selBtn} onClick={() => handlePopoverAction('quiz')}>
                                    <i className="fas fa-question-circle"></i> Quiz
                                </button>
                                <button className={styles.selBtn} onClick={() => handlePopoverAction('simplify')}>
                                    <i className="fas fa-compress-alt"></i> Simplify
                                </button>
                                <button className={styles.selBtn} onClick={() => handlePopoverAction('expand')}>
                                    <i className="fas fa-expand-alt"></i> Expand
                                </button>
                                <button className={`${styles.selBtn} ${styles.selBtnNote}`} onClick={() => handlePopoverAction('note')}>
                                    <i className="fas fa-sticky-note"></i> Note
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


