import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorSlide, EditorBbox } from '../../../api/slidesApi';
import type { SlideEdits } from '../hooks/useEditorSession';
import EditableTextOverlay from './EditableTextOverlay';
import ImageUploadOverlay from './ImageUploadOverlay';
import styles from '../styles/SlideEditor.module.css';

const API_ROOT = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';

interface Props {
    slide: EditorSlide | undefined;
    slideWidthPt: number;
    slideHeightPt: number;
    edits: SlideEdits | undefined;
    selectedId: string | null;
    onSelectElement: (id: string | null) => void;
    onTextChange: (id: string, text: string) => void;
    onImageUpload: (id: string, file: File) => void;
    /** Optional overlay rendered inside the canvas wrapper (absolute positioned). */
    renderOverlay?: () => React.ReactNode;
    /** Called when user clicks Save inside a text overlay. */
    onSave?: () => void;
    /** Whether a save/re-render is in progress. */
    isSaving?: boolean;
    /** Embedded mode: no dark background / padding (for use inside light layouts). */
    embedded?: boolean;
}

function scaleBbox(bbox: EditorBbox, scale: number): EditorBbox {
    return { x: bbox.x * scale, y: bbox.y * scale, w: bbox.w * scale, h: bbox.h * scale };
}

export default function SlideCanvas({
    slide, slideWidthPt, slideHeightPt, edits, selectedId,
    onSelectElement, onTextChange, onImageUpload, renderOverlay,
    onSave, isSaving, embedded,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    // Responsive scaling: fit canvas into container, leaving padding
    const recalcScale = useCallback(() => {
        const el = containerRef.current;
        if (!el || !slideWidthPt) return;
        if (embedded) {
            // Embedded mode: scale to fill parent width
            const maxW = el.clientWidth;
            setScale(Math.min(maxW / slideWidthPt, 1.5));
        } else {
            const maxW = el.clientWidth - 48;
            const maxH = el.clientHeight - 48;
            const scaleW = maxW / slideWidthPt;
            const scaleH = maxH / slideHeightPt;
            setScale(Math.min(scaleW, scaleH, 1.5));
        }
    }, [slideWidthPt, slideHeightPt, embedded]);

    useEffect(() => {
        recalcScale();
        const obs = new ResizeObserver(recalcScale);
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [recalcScale]);

    if (!slide) {
        return <div className={styles.canvasArea} ref={containerRef} />;
    }

    const canvasW = slideWidthPt * scale;
    const canvasH = slideHeightPt * scale;

    return (
        <div className={`${styles.canvasArea} ${embedded ? styles.canvasAreaEmbedded : ''}`} ref={containerRef} onClick={() => onSelectElement(null)}>
            <div className={styles.canvasWrapper} style={{ width: canvasW, height: canvasH, position: 'relative' }}>
                <img
                    src={`${API_ROOT}${slide.preview_url}`}
                    className={styles.slideBg}
                    draggable={false}
                    alt=""
                />
                {slide.elements.map((el) => {
                    const edit = edits?.[el.id];
                    const bbox = scaleBbox(el.bbox, scale);

                    if (el.type === 'text') {
                        return (
                            <EditableTextOverlay
                                key={el.id}
                                element={el}
                                bbox={bbox}
                                scale={scale}
                                currentContent={edit?.content ?? el.content ?? ''}
                                isSelected={selectedId === el.id}
                                onSelect={() => onSelectElement(el.id)}
                                onChange={(text) => onTextChange(el.id, text)}
                                onSave={onSave}
                                isSaving={isSaving}
                            />
                        );
                    }
                    return (
                        <ImageUploadOverlay
                            key={el.id}
                            element={el}
                            bbox={bbox}
                            currentAssetUrl={edit?.asset_url ?? null}
                            isSelected={selectedId === el.id}
                            onSelect={() => onSelectElement(el.id)}
                            onUpload={(file) => onImageUpload(el.id, file)}
                        />
                    );
                })}
                {renderOverlay?.()}
            </div>
        </div>
    );
}
