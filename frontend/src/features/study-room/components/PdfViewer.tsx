import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PdfLoader } from 'react-pdf-highlighter';
import 'react-pdf-highlighter/dist/esm/style/PdfHighlighter.css';
import 'react-pdf-highlighter/dist/esm/style/Highlight.css';
import 'react-pdf-highlighter/dist/esm/style/Tip.css';
import 'react-pdf-highlighter/dist/esm/style/pdf_viewer.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import styles from '../styles/StudyRoom.module.css';
import PdfDocBridge from './pdf-viewer/PdfDocBridge';
import SelectionActionGrid from './pdf-viewer/SelectionActionGrid';
import extractAllText from './pdf-viewer/extractAllText';

const WORKER_URL = '/pdf.worker.2.16.105.min.js';
const IDLE_EXTRACTION_TIMEOUT_MS = 200;

interface PdfViewerProps {
    file?: File | null;
    fileType?: string;
    onHighlight?: (text: string, mode: string) => void;
    onClose?: () => void;
    onAddNote?: (note: { content: string; color: string; highlightedText: string }) => void;
    onTextExtracted?: (text: string) => void;
}

export default function PdfViewer({
    file,
    fileType,
    onHighlight,
    onClose,
    onAddNote,
    onTextExtracted,
}: PdfViewerProps) {
    const [popover, setPopover] = useState<{ text: string; x: number; y: number } | null>(null);
    const viewerBodyRef = useRef<HTMLDivElement>(null);
    const textExtractedRef = useRef(false);
    const pdfDocRef = useRef<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const currentPageRef = useRef(1);
    const [totalPages, setTotalPages] = useState(0);
    const pdfWrapRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
    const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
    const [mdHtml, setMdHtml] = useState('');
    const idleTaskRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        textExtractedRef.current = false;
        pdfDocRef.current = null;
        setCurrentPage(1);
        currentPageRef.current = 1;
        setTotalPages(0);
        setPdfLoadError(null);
    }, [file, fileType]);

    useEffect(() => () => {
        if (idleTaskRef.current === null) {
            return;
        }

        if (typeof globalThis !== 'undefined' && 'cancelIdleCallback' in globalThis) {
            globalThis.cancelIdleCallback(idleTaskRef.current as number);
        } else {
            clearTimeout(idleTaskRef.current);
        }
        idleTaskRef.current = null;
    }, []);

    useEffect(() => {
        if (fileType !== 'pdf' || !totalPages) return;

        const wrap = pdfWrapRef.current;
        if (!wrap) return;

        const timer = setTimeout(() => {
            const pages = wrap.querySelectorAll('.page');
            if (!pages.length) return;

            observerRef.current = new IntersectionObserver(
                (entries) => {
                    let bestPage = currentPageRef.current;
                    let bestRatio = 0;

                    for (const entry of entries) {
                        if (entry.intersectionRatio <= bestRatio) {
                            continue;
                        }

                        bestRatio = entry.intersectionRatio;
                        const pageNumber = Number.parseInt(
                            (entry.target as HTMLElement).dataset.pageNumber ?? '',
                            10,
                        );
                        if (pageNumber) {
                            bestPage = pageNumber;
                        }
                    }

                    if (bestRatio > 0) {
                        setCurrentPage(bestPage);
                        currentPageRef.current = bestPage;
                    }
                },
                {
                    root: wrap.querySelector('.PdfHighlighter') || wrap,
                    threshold: [0, 0.25, 0.5, 0.75],
                },
            );

            pages.forEach((page) => observerRef.current?.observe(page));
        }, 500);

        return () => {
            clearTimeout(timer);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
        };
    }, [fileType, totalPages]);

    useEffect(() => {
        if (fileType === 'pdf' && file) {
            let cancelled = false;
            setPdfBuffer(null);
            setPdfLoadError(null);

            file.arrayBuffer()
                .then((buffer) => {
                    if (!cancelled) {
                        setPdfBuffer(buffer);
                    }
                })
                .catch((error) => {
                    if (!cancelled) {
                        console.error('PDF file read failed', error);
                        setPdfLoadError('Unable to read this PDF file.');
                    }
                });

            return () => {
                cancelled = true;
            };
        }

        setPdfBuffer(null);
        setPdfLoadError(null);
    }, [file, fileType]);

    const handlePdfLoad = useCallback(
        async (pdfDocument: any) => {
            if (!onTextExtracted || textExtractedRef.current) return;

            textExtractedRef.current = true;

            const runExtraction = async () => {
                try {
                    const text = await extractAllText(pdfDocument);
                    onTextExtracted(text);
                } catch (error) {
                    console.error('PDF text extraction failed', error);
                }
            };

            if (typeof globalThis !== 'undefined' && 'requestIdleCallback' in globalThis) {
                idleTaskRef.current = globalThis.requestIdleCallback(() => {
                    idleTaskRef.current = null;
                    void runExtraction();
                }, { timeout: IDLE_EXTRACTION_TIMEOUT_MS });
                return;
            }

            idleTaskRef.current = setTimeout(() => {
                idleTaskRef.current = null;
                void runExtraction();
            }, 0);
        },
        [onTextExtracted],
    );

    const handlePdfDocumentLoad = useCallback(
        (pdfDocument: any) => {
            if (pdfDocRef.current === pdfDocument) return;

            pdfDocRef.current = pdfDocument;
            setTotalPages(pdfDocument.numPages);
            handlePdfLoad(pdfDocument);
        },
        [handlePdfLoad],
    );

    const handleSelectionUp = useCallback(() => {
        const selection = globalThis.getSelection();
        if (!selection || selection.isCollapsed) {
            setPopover(null);
            return;
        }

        const text = selection.toString().trim();
        if (!text || text.length < 3) {
            setPopover(null);
            return;
        }

        const body = viewerBodyRef.current;
        if (!body?.contains(selection.anchorNode)) {
            setPopover(null);
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setPopover({
            text,
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
        });
    }, []);

    useEffect(() => {
        const dismiss = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(`.${styles.selPopover}`)) return;
            setPopover(null);
        };

        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
    }, []);

    const handleTextAction = useCallback(
        (mode: string, text: string) => {
            globalThis.getSelection()?.removeAllRanges();

            if (mode === 'note') {
                onAddNote?.({ content: text, color: 'yellow', highlightedText: text });
            } else {
                onHighlight?.(text, mode);
            }
        },
        [onAddNote, onHighlight],
    );

    const handlePopoverAction = useCallback(
        (mode: string) => {
            if (!popover) return;

            const text = popover.text;
            setPopover(null);
            handleTextAction(mode, text);
        },
        [handleTextAction, popover],
    );

    useEffect(() => {
        if (fileType !== 'md' || !file) {
            setMdHtml('');
            return;
        }

        let cancelled = false;
        file.text().then((text) => {
            if (cancelled) return;
            const raw = marked.parse(text || '') as string;
            setMdHtml(DOMPurify.sanitize(raw));
            onTextExtracted?.(text || '');
        });

        return () => {
            cancelled = true;
        };
    }, [file, fileType, onTextExtracted]);

    const renderSelectionTip = useCallback(
        (_position: unknown, content: { text?: string }, hideTipAndSelection: () => void) => {
            const text = content?.text?.trim();
            if (!text || text.length < 3) return null;

            const doAction = (mode: string) => {
                hideTipAndSelection();
                handleTextAction(mode, text);
            };

            return <SelectionActionGrid onAction={doAction} />;
        },
        [handleTextAction],
    );

    const fileName = file?.name || 'Document';
    const pdfSourceUrl = file
        ? `/study-room-local/${encodeURIComponent(file.name)}?size=${file.size}&modified=${file.lastModified}`
        : '';
    const pdfLoaderData = pdfBuffer ? new Uint8Array(pdfBuffer.slice(0)) : null;

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

            {fileType === 'pdf' ? (
                <div className={styles.pdfHighlighterWrap} ref={pdfWrapRef}>
                    {pdfLoadError ? (
                        <div className={styles.pdfStatusMessage}>
                            <i className="fas fa-exclamation-triangle"></i>
                            <span>{pdfLoadError}</span>
                        </div>
                    ) : pdfLoaderData ? (
                        <PdfLoader
                            url={pdfSourceUrl}
                            workerSrc={WORKER_URL}
                            {...({ data: pdfLoaderData } as { data: Uint8Array })}
                            beforeLoad={
                                <div className={styles.pdfStatusMessage}>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    <span>Loading PDF...</span>
                                </div>
                            }
                            errorMessage={
                                <div className={styles.pdfStatusMessage}>
                                    <i className="fas fa-exclamation-triangle"></i>
                                    <span>Unable to display this PDF.</span>
                                </div>
                            }
                            onError={(error) => {
                                console.error('PdfLoader error', error);
                                setPdfLoadError('Unable to display this PDF.');
                            }}
                        >
                            {(pdfDocument) => (
                                <PdfDocBridge
                                    pdfDocument={pdfDocument}
                                    onLoad={handlePdfDocumentLoad}
                                    renderSelectionTip={renderSelectionTip}
                                />
                            )}
                        </PdfLoader>
                    ) : (
                        <div className={styles.pdfStatusMessage}>
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>Reading PDF...</span>
                        </div>
                    )}
                </div>
            ) : (
                <div
                    className={styles.viewerBody}
                    ref={viewerBodyRef}
                    onMouseUp={handleSelectionUp}
                >
                    <div
                        className={styles.mdContent}
                        dangerouslySetInnerHTML={{ __html: mdHtml }}
                    />

                    {popover && (
                        <div
                            className={styles.selPopover}
                            style={{ left: `${popover.x}px`, top: `${popover.y}px` }}
                        >
                            <SelectionActionGrid onAction={handlePopoverAction} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
