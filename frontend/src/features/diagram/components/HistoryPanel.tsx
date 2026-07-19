import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import HistoryPanel from '../../../shared/components/HistoryPanel/HistoryPanel';
import * as api from '../api/historyApi';
import { resolveApiRoot } from '@/shared/api/root';
import s from '../../../styles/history.module.css';

const BASE_URL = resolveApiRoot();

/** Normalise an image entry – may be a plain string or {src: '…'} object. */
const toSrc = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && 'src' in v) return String((v as any).src ?? '');
    return '';
};

const fmt = (v: any, fb = '-') => {
    if (v == null) return fb;
    if (Array.isArray(v)) { const f = v.filter(x => String(x ?? '').trim()); return f.length ? f.join(', ') : fb; }
    return String(v).trim() || fb;
};

const historyApi = { getHistory: api.getGenerationHistory, getDetail: api.getGenerationDetail };

/** Derive a human-readable label from the merged history item's tool / service_type. */
function toolLabel(item: any): string {
    const tool = String(item.tool || item.params?.service_type || '').toLowerCase();
    if (tool === 'extract_diagram' || tool === 'extract') return 'Extract Diagram';
    if (tool === 'generate' || tool === 'ai_generate') return 'AI Generate';
    if (tool === 'extract_pdf_images') return 'Image Extract';
    if (tool === 'ai_image_generate') return 'AI Images';
    if (tool === 'diagram_assistant' || tool === 'assistant') return 'Diagram Copilot';
    return fmt(tool, 'Visual Tool');
}

/* ── Image lightbox modal ───────────────────────────────── */
interface LightboxProps {
    src: string;
    index: number;
    total: number;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
}

function Lightbox({ src, index, total, onClose, onPrev, onNext }: LightboxProps) {
    const safeSrc = toSrc(src);
    const fullSrc = safeSrc.startsWith('/') ? `${BASE_URL}${safeSrc}` : safeSrc;

    const handleDownload = useCallback(async () => {
        try {
            const resp = await fetch(fullSrc, { mode: 'cors' });
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `diagram_${index + 1}.png`;
            a.click();
            URL.revokeObjectURL(blobUrl);
        } catch {
            // Fallback: open in new tab
            window.open(fullSrc, '_blank');
        }
    }, [fullSrc, index]);

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const modal = (
        <motion.div
            style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                zIndex: 9999,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleOverlayClick}
        >
            {/* Close */}
            <motion.button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 18, right: 22,
                    background: 'rgba(255,255,255,0.12)', border: 'none',
                    color: '#fff', fontSize: '1.5rem', width: 40, height: 40,
                    borderRadius: '50%', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Close"
            >
                <i className="fas fa-times" />
            </motion.button>

            {/* Prev */}
            {total > 1 && (
                <motion.button
                    onClick={onPrev}
                    style={{
                        position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(255,255,255,0.12)', border: 'none',
                        color: '#fff', fontSize: '1.3rem', width: 44, height: 44,
                        borderRadius: '50%', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title="Previous"
                >
                    <i className="fas fa-chevron-left" />
                </motion.button>
            )}

            {/* Image */}
            <motion.div 
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: '88vw' }}
                initial={{ scale: 0.92, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
                <img
                    src={fullSrc}
                    alt={`Diagram ${index + 1}`}
                    style={{
                        maxWidth: '80vw', maxHeight: '70vh',
                        objectFit: 'contain',
                        borderRadius: 10,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                        background: '#fff', 
                    }}
                />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.92rem', fontWeight: 500 }}>
                        {index + 1} / {total}
                    </span>
                    <button
                        onClick={handleDownload}
                        style={{
                            background: '#0f766e', border: 'none', color: '#fff',
                            padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                            fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6,
                            fontWeight: 500, transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#0d655f'}
                        onMouseLeave={e => e.currentTarget.style.background = '#0f766e'}
                    >
                        <i className="fas fa-download" /> Download
                    </button>
                </div>
            </motion.div>

            {/* Next */}
            {total > 1 && (
                <motion.button
                    onClick={onNext}
                    style={{
                        position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(255,255,255,0.12)', border: 'none',
                        color: '#fff', fontSize: '1.3rem', width: 44, height: 44,
                        borderRadius: '50%', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title="Next"
                >
                    <i className="fas fa-chevron-right" />
                </motion.button>
            )}
        </motion.div>
    );

    return createPortal(modal, document.body);
}

/* ── Image grid shown in detail content ─────────────────── */
function ExtractedImageGrid({ images }: { images: unknown[] }) {
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
    const normalised = images.map(toSrc).filter(Boolean);

    if (!normalised.length) return <div className={s.historyDetailLoading}>No images saved for this entry.</div>;

    return (
        <>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 12,
                padding: '4px 0',
            }}>
                {normalised.map((url, idx) => {
                    const fullUrl = url.startsWith('/') ? `${BASE_URL}${url}` : url;
                    return (
                        <div
                            key={idx}
                            onClick={() => setLightboxIdx(idx)}
                            style={{
                                cursor: 'pointer',
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '2px solid #e2e8f0',
                                background: '#f8fafc',
                                transition: 'border-color 0.15s, transform 0.15s',
                                aspectRatio: '4/3',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLDivElement).style.borderColor = '#0f766e';
                                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
                                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                            }}
                            role="button"
                            tabIndex={0}
                            title={`Diagram ${idx + 1} — click to view`}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIdx(idx); } }}
                        >
                            <img
                                src={fullUrl}
                                alt={`Diagram ${idx + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                        </div>
                    );
                })}
            </div>

            <AnimatePresence>
                {lightboxIdx !== null && (
                    <Lightbox
                        src={normalised[lightboxIdx]}
                        index={lightboxIdx}
                        total={normalised.length}
                        onClose={() => setLightboxIdx(null)}
                        onPrev={() => setLightboxIdx((lightboxIdx - 1 + normalised.length) % normalised.length)}
                        onNext={() => setLightboxIdx((lightboxIdx + 1) % normalised.length)}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

/* ── SVG result renderer ────────────────────────────────── */
function SvgResult({ svgContent }: { svgContent: string }) {
    const handleDownload = () => {
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.svg';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div dangerouslySetInnerHTML={{ __html: svgContent }} style={{ display: 'flex', justifyContent: 'center', padding: 16 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleDownload}
                    style={{
                        background: '#0f766e', border: 'none', color: '#fff',
                        padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                        fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    <i className="fas fa-download" /> Download SVG
                </button>
            </div>
        </div>
    );
}

/* ── Main panel component ───────────────────────────────── */
export default function DiagramHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    return (
        <HistoryPanel
            api={historyApi}
            title="Generation History"
            subtitle="Recent Visual Tool usage — Extract, Image Extract, and AI Generate"
            detailTitle="Visual Tool Generation Details"
            onReplay={onReplay}
            renderCard={(item) => (
                <>
                    <div className={s.historyItemTopRow}>
                        <div className={s.historyItemSubject}>{toolLabel(item)}</div>
                        <div className={s.historyItemDate} title={new Date(item.created_at ?? Date.now()).toLocaleString()}>{new Date(item.created_at ?? Date.now()).toLocaleDateString()}</div>
                    </div>
                    <div className={s.historyItemChips}>
                        <span className={s.historyChipPrimary}>{toolLabel(item)}</span>
                        {item.params?.provider && <span className={s.historyChip}>{item.params.provider}</span>}
                        {item.params?.extracted_count != null && <span className={s.historyChip}>{item.params.extracted_count} diagrams</span>}
                        {item.params?.num_images != null && <span className={s.historyChip}>{item.params.num_images} imgs</span>}
                    </div>
                    <div className={s.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>{toolLabel(cur)}</strong>
                        {cur.params?.provider && <>{' · '}{cur.params.provider}</>}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at ?? Date.now()).toLocaleString()}</div>
                </div>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Type</span><strong>{toolLabel(cur)}</strong></div>
                    {cur.params?.provider && <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params.provider)}</strong></div>}
                    {cur.params?.draft_quality != null && <div className={s.historyParamItem}><span>Draft Quality</span><strong>{fmt(cur.params.draft_quality)}</strong></div>}
                    {cur.params?.refined != null && <div className={s.historyParamItem}><span>Refined</span><strong>{cur.params.refined ? 'Yes' : 'No'}</strong></div>}
                    {cur.params?.extracted_count != null && <div className={s.historyParamItem}><span>Extracted</span><strong>{cur.params.extracted_count} diagrams</strong></div>}
                    {cur.params?.source_filename && <div className={s.historyParamItem}><span>Source File</span><strong>{fmt(cur.params.source_filename)}</strong></div>}
                    {cur.params?.prompt && <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Prompt</span><strong>{fmt(cur.params.prompt)}</strong></div>}
                    {cur.params?.input_prompt && <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Input Prompt</span><strong>{fmt(cur.params.input_prompt)}</strong></div>}
                </>
            )}
            renderDetailContent={(detail) => {
                if (!detail?.result) return <div className={s.historyDetailLoading}>No result data available.</div>;

                let parsed: any = null;
                const resultStr = String(detail.result);
                try { parsed = JSON.parse(resultStr); } catch { /* not JSON */ }

                // Extract Diagram — show image grid
                if (parsed?.images && Array.isArray(parsed.images)) {
                    return <ExtractedImageGrid images={parsed.images} />;
                }

                // AI Generate Diagram — show rendered SVG
                if (parsed?.svg) {
                    return <SvgResult svgContent={parsed.svg} />;
                }

                // AI Images — show image grid from URLs
                if (parsed?.ai_images && Array.isArray(parsed.ai_images)) {
                    return <ExtractedImageGrid images={parsed.ai_images} />;
                }

                // Diagram Copilot — replayable structured tool output
                if (parsed?.ui_elements && Array.isArray(parsed.ui_elements)) {
                    const svgElement = parsed.ui_elements.find((item: any) => item?.svg);
                    const imageElement = parsed.ui_elements.find((item: any) => Array.isArray(item?.images));
                    if (svgElement?.svg) return <SvgResult svgContent={svgElement.svg} />;
                    if (imageElement?.images) return <ExtractedImageGrid images={imageElement.images} />;
                    if (parsed.assistant_text) {
                        return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{parsed.assistant_text}</pre>;
                    }
                }

                // Fallback: raw text
                return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{resultStr}</pre>;
            }}
        />
    );
}
