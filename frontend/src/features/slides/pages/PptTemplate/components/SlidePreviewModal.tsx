import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { slidesEditorApi } from '../../../api/slidesApi';
import type { EditorSession } from '../../../api/slidesApi';
import type { SlideEdits } from '../../Editor/hooks/useEditorSession';
import type { FloatingImage } from '../types';
import SlideCanvas from '../../Editor/components/SlideCanvas';
import DraggableImageLayer from './DraggableImageLayer';

const genId = () => `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
    });
}

interface Props {
    session: EditorSession;
    initialSlideIndex: number;
    apiBase: string;
    textEdits: Record<number, Record<string, string>>;
    floatingImages: Record<number, FloatingImage[]>;
    onTextChange: (slideIdx: number, elementId: string, text: string) => void;
    onFloatingImageAdd: (slideIdx: number, img: FloatingImage) => void;
    onFloatingImageMove: (slideIdx: number, id: string, xPct: number, yPct: number) => void;
    onFloatingImageRemove: (slideIdx: number, id: string) => void;
    /** Called when user clicks Save & Close. previewOverrides maps slideIdx → composite blob URL. */
    onSave: (previewOverrides: Record<number, string>) => void;
    onClose: () => void;
}

export default function SlidePreviewModal({
    session, initialSlideIndex, apiBase,
    textEdits, floatingImages,
    onTextChange, onFloatingImageAdd, onFloatingImageMove, onFloatingImageRemove,
    onSave, onClose,
}: Props) {
    const [currentIdx, setCurrentIdx] = useState(initialSlideIndex);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const totalSlides = session.slides.length;
    const currentSlide = session.slides[currentIdx];

    // Convert textEdits for current slide → SlideEdits format expected by SlideCanvas
    const sliceEdits: SlideEdits = Object.fromEntries(
        Object.entries(textEdits[currentIdx] ?? {}).map(([id, content]) => [id, { content }])
    );

    // Reset selected element when slide changes
    useEffect(() => {
        setSelectedElementId(null);
    }, [currentIdx]);

    // Keyboard navigation & Esc to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                onCloseRef.current();
            }
            if (e.key === 'ArrowLeft') setCurrentIdx(prev => Math.max(0, prev - 1));
            if (e.key === 'ArrowRight') setCurrentIdx(prev => Math.min(totalSlides - 1, prev + 1));
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [totalSlides]);

    // ── Canvas composite: draw slide bg + floating images ──
    const generateCompositePreview = useCallback(async (slideIdx: number): Promise<string | undefined> => {
        const slide = session.slides[slideIdx];
        const imgs = floatingImages[slideIdx] ?? [];
        if (imgs.length === 0) return undefined;

        const W = 960, H = 540;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        try {
            const bgImg = await loadImage(`${apiBase}${slide.preview_url}`);
            ctx.drawImage(bgImg, 0, 0, W, H);
            for (const fi of imgs) {
                const fImg = await loadImage(fi.previewUrl);
                const x = fi.xPct * W;
                const y = fi.yPct * H;
                const w = fi.wPct * W;
                const h = w * (fImg.naturalHeight / fImg.naturalWidth);
                ctx.drawImage(fImg, x, y, w, h);
            }
            return await new Promise<string | undefined>(resolve => {
                canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : undefined), 'image/jpeg', 0.92);
            });
        } catch {
            return undefined;
        }
    }, [session, floatingImages, apiBase]);

    // ── Save: composite all slides with floating images, then close ──
    const handleSave = async () => {
        setSaving(true);
        try {
            const overrides: Record<number, string> = {};
            for (let i = 0; i < session.slides.length; i++) {
                if ((floatingImages[i]?.length ?? 0) > 0) {
                    const url = await generateCompositePreview(i);
                    if (url) overrides[i] = url;
                }
            }
            onSave(overrides);
        } finally {
            setSaving(false);
        }
    };

    const handleAddImage = async (file: File) => {
        setUploadingImage(true);
        try {
            const { asset_id } = await slidesEditorApi.uploadImage(file);
            const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '.png';
            const previewUrl = URL.createObjectURL(file);
            const newImg: FloatingImage = {
                id: genId(),
                previewUrl,
                assetId: asset_id,
                ext,
                xPct: 0.1,
                yPct: 0.1,
                wPct: 0.35,
            };
            onFloatingImageAdd(currentIdx, newImg);
            toast.success('Image added — drag to reposition');
        } catch {
            toast.error('Image upload failed');
        } finally {
            setUploadingImage(false);
        }
    };

    const currentFloatingImages = floatingImages[currentIdx] ?? [];
    const hasAnyEdit = session.slides.some((_, i) =>
        (floatingImages[i]?.length ?? 0) > 0 ||
        Object.keys(textEdits[i] ?? {}).length > 0
    );

    return (
        /* Backdrop */
        <motion.div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9998,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
        >
            {/* Modal card */}
            <motion.div
                style={{
                    background: '#1a1d23',
                    borderRadius: 20,
                    width: 'min(92vw, 1280px)',
                    height: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                }}
                initial={{ scale: 0.92, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 20px',
                    background: '#23262d',
                    borderBottom: '1px solid #31343c',
                    flexShrink: 0,
                    gap: 10,
                }}>
                    <button
                        onClick={onClose}
                        title="Close"
                        style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#31343c',
                            color: '#9ca0a8',
                            cursor: 'pointer',
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <i className="fas fa-times" />
                    </button>

                    <span style={{ color: '#e4e6ea', fontWeight: 600, fontSize: 15 }}>
                        Slide {currentIdx + 1}
                        <span style={{ color: '#64748b', fontWeight: 400 }}> / {totalSlides}</span>
                    </span>

                    {/* Slide dot indicators */}
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8, overflow: 'hidden', maxWidth: 320 }}>
                        {session.slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentIdx(i)}
                                style={{
                                    width: i === currentIdx ? 18 : 8,
                                    height: 8,
                                    borderRadius: 4,
                                    border: 'none',
                                    background: i === currentIdx ? '#007B55' : '#31343c',
                                    cursor: 'pointer',
                                    padding: 0,
                                    flexShrink: 0,
                                    transition: 'width 0.2s ease, background 0.2s ease',
                                }}
                                title={`Slide ${i + 1}`}
                            />
                        ))}
                    </div>

                    <div style={{ flex: 1 }} />

                    <button
                        onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                        disabled={currentIdx === 0}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#31343c',
                            color: currentIdx === 0 ? '#4a4f5a' : '#c8cad0',
                            cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <i className="fas fa-chevron-left" /> Prev
                    </button>

                    <button
                        onClick={() => setCurrentIdx(prev => Math.min(totalSlides - 1, prev + 1))}
                        disabled={currentIdx === totalSlides - 1}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#31343c',
                            color: currentIdx === totalSlides - 1 ? '#4a4f5a' : '#c8cad0',
                            cursor: currentIdx === totalSlides - 1 ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        Next <i className="fas fa-chevron-right" />
                    </button>
                </div>

                {/* ── Canvas area ── */}
                <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <SlideCanvas
                        slide={currentSlide}
                        slideWidthPt={session.slide_width_pt}
                        slideHeightPt={session.slide_height_pt}
                        edits={sliceEdits}
                        selectedId={selectedElementId}
                        onSelectElement={setSelectedElementId}
                        onTextChange={(id, text) => onTextChange(currentIdx, id, text)}
                        onImageUpload={() => { /* use Add Free Image button */ }}
                        renderOverlay={() => (
                            <DraggableImageLayer
                                images={currentFloatingImages}
                                onMove={(id, x, y) => onFloatingImageMove(currentIdx, id, x, y)}
                                onRemove={(id) => onFloatingImageRemove(currentIdx, id)}
                            />
                        )}
                    />
                </div>

                {/* ── Footer ── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px',
                    background: '#23262d',
                    borderTop: '1px solid #31343c',
                    flexShrink: 0,
                    gap: 12,
                }}>
                    <span style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-mouse-pointer" />
                        Click text areas to edit · Drag images to reposition · ← → to navigate
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {currentFloatingImages.length > 0 && (
                            <span style={{ fontSize: 12, color: '#00b894', fontWeight: 500 }}>
                                {currentFloatingImages.length} image{currentFloatingImages.length > 1 ? 's' : ''} on this slide
                            </span>
                        )}

                        {/* Add Free Image button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingImage || saving}
                            style={{
                                padding: '8px 18px',
                                borderRadius: 8,
                                border: '1px solid rgba(0,123,85,0.4)',
                                background: 'transparent',
                                color: '#00b894',
                                cursor: (uploadingImage || saving) ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                fontSize: 14,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                opacity: (uploadingImage || saving) ? 0.6 : 1,
                                transition: 'opacity 0.15s',
                            }}
                        >
                            {uploadingImage
                                ? <><span className="spinner-border spinner-border-sm" /> Uploading...</>
                                : <><i className="fas fa-image" /> Add Free Image</>}
                        </button>

                        {/* Save & Close button */}
                        <button
                            onClick={handleSave}
                            disabled={saving || uploadingImage}
                            style={{
                                padding: '8px 24px',
                                borderRadius: 8,
                                border: 'none',
                                background: hasAnyEdit
                                    ? 'linear-gradient(135deg, #007B55, #00b894)'
                                    : '#31343c',
                                color: hasAnyEdit ? '#fff' : '#9ca0a8',
                                cursor: (saving || uploadingImage) ? 'not-allowed' : 'pointer',
                                fontWeight: 700,
                                fontSize: 14,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                opacity: (saving || uploadingImage) ? 0.7 : 1,
                                transition: 'opacity 0.15s, background 0.2s',
                                boxShadow: hasAnyEdit ? '0 4px 14px rgba(0,123,85,0.35)' : 'none',
                            }}
                        >
                            {saving
                                ? <><span className="spinner-border spinner-border-sm" /> Saving...</>
                                : <><i className="fas fa-check" /> Save &amp; Close</>}
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAddImage(file);
                                e.target.value = '';
                            }}
                        />
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
