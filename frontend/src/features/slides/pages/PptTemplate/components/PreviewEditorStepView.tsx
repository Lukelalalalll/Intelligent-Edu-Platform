import type React from 'react';
import styles from '../styles/pptTemplate.module.css';
import type { EditorSession } from '../../../api/slidesApi';
import type { FloatingImage } from '../types';
import SlideCanvas from '../../Editor/components/SlideCanvas';
import DraggableImageLayer from './DraggableImageLayer';
import type { SlideEdits } from '../../Editor/hooks/useEditorSession';

type SlideCallbacks = {
    onSelect: () => void;
    onOpenUpload: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onTextChange: (id: string, text: string) => void;
    onMoveImage: (imgId: string, x: number, y: number) => void;
    onRemoveImage: (imgId: string) => void;
};

type Props = {
    session: EditorSession;
    apiBase: string;
    activeSlideIdx: number;
    textEdits: Record<number, Record<string, string>>;
    floatingImages: Record<number, FloatingImage[]>;
    selectedElementId: string | null;
    uploadingFreeImage: boolean;
    hasUnsavedEdits: boolean;
    isSaving: boolean;
    isExporting: boolean;
    slideCallbacks: SlideCallbacks[];
    freeImageInputRef: React.RefObject<HTMLInputElement>;
    onBack: () => void;
    onSave: () => void;
    onExport: () => void;
    onSidebarSlideClick: (index: number) => void;
    onSelectElement: (id: string | null) => void;
    onFreeImageInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function PreviewEditorStepView({
    session,
    apiBase,
    activeSlideIdx,
    textEdits,
    floatingImages,
    selectedElementId,
    uploadingFreeImage,
    hasUnsavedEdits,
    isSaving,
    isExporting,
    slideCallbacks,
    freeImageInputRef,
    onBack,
    onSave,
    onExport,
    onSidebarSlideClick,
    onSelectElement,
    onFreeImageInputChange,
}: Props) {
    return (
        <div className={`card ${styles.sectionCard} ${styles.cardStep3}`}>
            <div className={styles.editorHeader}>
                <button type="button" className={styles.editorBackBtn} onClick={onBack}>
                    <i className="fas fa-arrow-left me-1" /> Back
                </button>
                <h5 className={styles.editorTitle}>
                    <i className="fas fa-images me-2" aria-hidden="true" />Preview &amp; Edit
                </h5>
                <span className={styles.editorSlideCount}>{session.slides.length} slides</span>
                <div style={{ flex: 1 }} />
                <button
                    type="button"
                    className={`${styles.editorSaveBtn} ${hasUnsavedEdits ? styles.editorSaveBtnActive : ''}`}
                    disabled={isSaving || !hasUnsavedEdits}
                    onClick={onSave}
                >
                    {isSaving
                        ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
                        : <><i className="fas fa-save me-2" />Save</>}
                </button>
                <button
                    type="button"
                    className={styles.editorExportBtn}
                    disabled={isExporting || isSaving}
                    onClick={onExport}
                >
                    {isExporting
                        ? <><span className="spinner-border spinner-border-sm me-2" />Exporting...</>
                        : <><i className="fas fa-download me-2" />Download PPTX</>}
                </button>
            </div>
            <div className={styles.editorBody}>
                <div className={styles.editorSidebar}>
                    {session.slides.map((slide, idx) => (
                        <div
                            key={idx}
                            className={`${styles.sidebarThumb} ${idx === activeSlideIdx ? styles.sidebarThumbActive : ''}`}
                            onClick={() => onSidebarSlideClick(idx)}
                            title={`Slide ${idx + 1}`}
                        >
                            <div className={styles.sidebarThumbImg}>
                                <img
                                    src={`${apiBase}${slide.preview_url}`}
                                    alt={`Slide ${idx + 1}`}
                                    draggable={false}
                                />
                            </div>
                            <span className={styles.sidebarThumbLabel}>{idx + 1}</span>
                            {((textEdits[idx] && Object.keys(textEdits[idx]).length > 0) || (floatingImages[idx]?.length ?? 0) > 0) && (
                                <div className={styles.sidebarEditedBadge}>Edited</div>
                            )}
                        </div>
                    ))}
                </div>
                <div className={styles.editorMain}>
                    {isSaving && (
                        <div className={styles.savingOverlay}>
                            <div className={styles.savingCard}>
                                <div className={styles.savingSpinner} />
                                <span>Saving &amp; re-rendering slides...</span>
                            </div>
                        </div>
                    )}
                    <div className={styles.slidesWrapper}>
                        {session.slides.map((slide, idx) => (
                            <div
                                key={idx}
                                id={`slide-item-${idx}`}
                                className={styles.slideItem}
                                onClick={slideCallbacks[idx]?.onSelect}
                            >
                                <div className={styles.slideHoverBar}>
                                    <span className={styles.slideNumber}>{idx + 1}</span>
                                    <button
                                        type="button"
                                        className={styles.hoverBarBtn}
                                        title="Add image to this slide"
                                        disabled={uploadingFreeImage}
                                        onClick={slideCallbacks[idx]?.onOpenUpload}
                                    >
                                        <i className="fas fa-image" />
                                    </button>
                                </div>
                                <SlideCanvas
                                    embedded
                                    slide={slide}
                                    slideWidthPt={session.slide_width_pt}
                                    slideHeightPt={session.slide_height_pt}
                                    edits={Object.fromEntries(
                                        Object.entries(textEdits[idx] ?? {}).map(([id, content]) => [id, { content }]),
                                    ) as SlideEdits}
                                    selectedId={selectedElementId}
                                    onSelectElement={onSelectElement}
                                    onTextChange={slideCallbacks[idx]?.onTextChange}
                                    onImageUpload={() => {}}
                                    onSave={onSave}
                                    isSaving={isSaving}
                                    renderOverlay={() => (
                                        <DraggableImageLayer
                                            images={floatingImages[idx] ?? []}
                                            onMove={slideCallbacks[idx]?.onMoveImage}
                                            onRemove={slideCallbacks[idx]?.onRemoveImage}
                                        />
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <input
                ref={freeImageInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onFreeImageInputChange}
            />
        </div>
    );
}
