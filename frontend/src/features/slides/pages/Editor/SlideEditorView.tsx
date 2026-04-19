import React from 'react';
import EditorToolbar from './components/EditorToolbar';
import ThumbnailPanel from './components/ThumbnailPanel';
import SlideCanvas from './components/SlideCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import styles from './styles/SlideEditor.module.css';

type SlideEditorViewProps = {
    session: any;
    loading: boolean;
    error: string | null;
    editorState: any;
    canUndo: boolean;
    canRedo: boolean;
    activeSlide: number;
    selectedElementId: string | null;
    exporting: boolean;
    onBack: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onSelectSlide: (idx: number) => void;
    onSelectElement: (id: string | null) => void;
    onTextChange: (id: string, text: string) => void;
    onImageUpload: (id: string, file: File) => Promise<void>;
    onExport: () => Promise<void>;
};

export default function SlideEditorView({
    session, loading, error, editorState,
    canUndo, canRedo, activeSlide, selectedElementId, exporting,
    onBack, onUndo, onRedo, onSelectSlide, onSelectElement,
    onTextChange, onImageUpload, onExport,
}: SlideEditorViewProps) {
    if (loading) {
        return (
            <div className={styles.editorRoot}>
                <div className={styles.loadingScreen}>
                    <div className={styles.spinner} />
                    <span>正在加载编辑器...</span>
                </div>
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className={styles.editorRoot}>
                <div className={styles.errorScreen}>
                    <i className="fas fa-exclamation-triangle" style={{ fontSize: 32 }} />
                    <p>{error || '未找到编辑器会话'}</p>
                    <button className={`${styles.toolbarBtn} ${styles.btnSecondary}`} onClick={onBack}>
                        返回
                    </button>
                </div>
            </div>
        );
    }

    const currentSlide = session.slides[activeSlide];
    const selectedElement = currentSlide?.elements.find((el: any) => el.id === selectedElementId) ?? null;

    return (
        <div className={styles.editorRoot}>
            <EditorToolbar
                title={session.theme}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                onBack={onBack}
                onExport={onExport}
                exporting={exporting}
            />

            <div className={styles.editorBody}>
                <ThumbnailPanel
                    slides={session.slides}
                    activeIndex={activeSlide}
                    onSelect={onSelectSlide}
                />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <SlideCanvas
                        slide={currentSlide}
                        slideWidthPt={session.slide_width_pt}
                        slideHeightPt={session.slide_height_pt}
                        edits={editorState[activeSlide]}
                        selectedId={selectedElementId}
                        onSelectElement={onSelectElement}
                        onTextChange={onTextChange}
                        onImageUpload={onImageUpload}
                    />

                    <div className={styles.slideNav}>
                        <button
                            className={styles.slideNavBtn}
                            disabled={activeSlide === 0}
                            onClick={() => onSelectSlide(activeSlide - 1)}
                        >
                            <i className="fas fa-chevron-left" /> 上一页
                        </button>
                        <span className={styles.slideNavLabel}>
                            {activeSlide + 1} / {session.slides.length}
                        </span>
                        <button
                            className={styles.slideNavBtn}
                            disabled={activeSlide >= session.slides.length - 1}
                            onClick={() => onSelectSlide(activeSlide + 1)}
                        >
                            下一页 <i className="fas fa-chevron-right" />
                        </button>
                    </div>
                </div>

                <PropertiesPanel element={selectedElement} />
            </div>
        </div>
    );
}
