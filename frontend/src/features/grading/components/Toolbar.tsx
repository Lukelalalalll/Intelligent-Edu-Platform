import React from 'react';

export const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface ToolbarProps {
    pageNumber: number;
    numPages?: number | null;
    scale: number;
    isPlacingLabel: boolean;
    onPrev: () => void;
    onNext: () => void;
    onScaleChange: (scale: number) => void;
    onToggleLabel: () => void;
}

export default function Toolbar({ pageNumber, numPages, scale, isPlacingLabel, onPrev, onNext, onScaleChange, onToggleLabel }: ToolbarProps) {
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={onPrev}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', minWidth: 56 }}
            >
                Prev
            </button>
            <span style={{ fontSize: 14, minWidth: 106, textAlign: 'center' }}>Page {pageNumber} / {numPages || '?'}</span>
            <button
                type="button"
                disabled={!numPages || pageNumber >= numPages}
                onClick={onNext}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', minWidth: 56 }}
            >
                Next
            </button>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 2 }}>Zoom</span>
            <select
                value={scale}
                onChange={(e) => onScaleChange(Number(e.target.value))}
                style={{ width: 96, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
            >
                {zoomLevels.map((z) => <option key={z} value={z}>{z === 1 ? 'Fit Width' : `${Math.round(z * 100)}%`}</option>)}
            </select>
            <button
                type="button"
                onClick={onToggleLabel}
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
    );
}
