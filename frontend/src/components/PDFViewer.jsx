import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import AnnotationLayer from './AnnotationLayer';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure pdf.js worker for Vite
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5];

export default function PDFViewer({ file, annotations = [], onAddAnnotation, onSelectAnnotation }) {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1);
    const containerRef = useRef(null);

    useEffect(() => {
        setPageNumber(1);
    }, [file]);

    const handlePageClick = (event, pageNum) => {
        if (!onAddAnnotation) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        onAddAnnotation({
            pageNumber: pageNum,
            x,
            y,
            width: 0.18,
            height: 0.08,
            comment: '',
            aiSuggestion: '',
            timestamp: new Date().toISOString(),
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => Math.max(1, p - 1))}>Prev</button>
                <span style={{ fontSize: 14 }}>Page {pageNumber} of {numPages || '?'}</span>
                <button disabled={!numPages || pageNumber >= numPages} onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}>Next</button>
                <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                    {zoomLevels.map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
                </select>
            </div>

            <div ref={containerRef} style={{ position: 'relative', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', minHeight: 400, padding: 12 }}>
                {file ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <Document file={file} onLoadSuccess={({ numPages: n }) => setNumPages(n)} loading={<div style={{ padding: 20 }}>Loading PDF...</div>}>
                            <Page
                                pageNumber={pageNumber}
                                scale={scale}
                                onClick={(e) => handlePageClick(e, pageNumber)}
                                renderAnnotationLayer={false}
                                renderTextLayer={true}
                            />
                        </Document>
                        <AnnotationLayer
                            annotations={annotations.filter((a) => a.pageNumber === pageNumber)}
                            onSelect={onSelectAnnotation}
                        />
                    </div>
                ) : (
                    <div style={{ padding: 20 }}>No PDF selected.</div>
                )}
            </div>
        </div>
    );
}
