import React, { useRef } from 'react';
import type { FloatingImage } from '../types';

interface DragRef {
    id: string;
    startClientX: number;
    startClientY: number;
    origXPct: number;
    origYPct: number;
}

interface Props {
    images: FloatingImage[];
    onMove: (id: string, xPct: number, yPct: number) => void;
    onRemove: (id: string) => void;
}

function clamp(min: number, max: number, val: number) {
    return Math.max(min, Math.min(max, val));
}

export default function DraggableImageLayer({ images, onMove, onRemove }: Props) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragRef | null>(null);

    const handlePointerDown = (img: FloatingImage, e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
        dragRef.current = {
            id: img.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            origXPct: img.xPct,
            origYPct: img.yPct,
        };
    };

    const handlePointerMove = (img: FloatingImage, e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== img.id || !wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        const dx = (e.clientX - drag.startClientX) / rect.width;
        const dy = (e.clientY - drag.startClientY) / rect.height;
        const newX = clamp(0, 1 - img.wPct, drag.origXPct + dx);
        const newY = clamp(0, 0.9, drag.origYPct + dy);
        onMove(img.id, newX, newY);
    };

    const handlePointerUp = () => {
        dragRef.current = null;
    };

    return (
        <div
            ref={wrapperRef}
            style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none' }}
        >
            {images.map((img) => (
                <div
                    key={img.id}
                    style={{
                        position: 'absolute',
                        left: `${img.xPct * 100}%`,
                        top: `${img.yPct * 100}%`,
                        width: `${img.wPct * 100}%`,
                        cursor: 'grab',
                        touchAction: 'none',
                        userSelect: 'none',
                        pointerEvents: 'auto',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                        borderRadius: 4,
                        border: '2px solid rgba(255,255,255,0.85)',
                    }}
                    onPointerDown={(e) => handlePointerDown(img, e)}
                    onPointerMove={(e) => handlePointerMove(img, e)}
                    onPointerUp={handlePointerUp}
                >
                    <img
                        src={img.previewUrl}
                        alt=""
                        style={{ width: '100%', display: 'block', borderRadius: 2, pointerEvents: 'none' }}
                        draggable={false}
                    />
                    <button
                        style={{
                            position: 'absolute',
                            top: -10,
                            right: -10,
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: '#e74c3c',
                            color: '#fff',
                            border: '2px solid #fff',
                            cursor: 'pointer',
                            fontSize: 11,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            lineHeight: '1',
                            zIndex: 2,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onRemove(img.id); }}
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
