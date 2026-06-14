import React, { useEffect } from 'react';
import { PdfHighlighter } from 'react-pdf-highlighter';

const AREA_SELECTION_DISABLED = () => false;
const NOOP = () => {};
const NULL_TRANSFORM = () => null as any;
const EMPTY_HIGHLIGHTS: any[] = [];

interface PdfDocBridgeProps {
    pdfDocument: any;
    onLoad: (pdfDocument: any) => void;
    renderSelectionTip: (...args: any[]) => React.ReactElement | null;
}

const PdfDocBridge = React.memo(function PdfDocBridge({
    pdfDocument,
    onLoad,
    renderSelectionTip,
}: PdfDocBridgeProps) {
    useEffect(() => {
        onLoad(pdfDocument);
    }, [onLoad, pdfDocument]);

    return (
        <PdfHighlighter
            pdfDocument={pdfDocument}
            enableAreaSelection={AREA_SELECTION_DISABLED}
            onScrollChange={NOOP}
            scrollRef={NOOP}
            onSelectionFinished={renderSelectionTip}
            highlightTransform={NULL_TRANSFORM}
            highlights={EMPTY_HIGHLIGHTS}
        />
    );
});

export default PdfDocBridge;
