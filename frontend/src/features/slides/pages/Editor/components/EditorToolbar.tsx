import React from 'react';
import styles from '../styles/SlideEditor.module.css';

interface Props {
    title?: string;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onBack: () => void;
    onExport: () => void;
    exporting: boolean;
}

export default function EditorToolbar({ title, canUndo, canRedo, onUndo, onRedo, onBack, onExport, exporting }: Props) {
    return (
        <div className={styles.toolbar}>
            <button className={`${styles.toolbarBtn} ${styles.btnBack}`} onClick={onBack}>
                <i className="fas fa-arrow-left" /> Back
            </button>

            <span className={styles.toolbarTitle}>{title || 'Untitled Presentation'}</span>

            <button className={`${styles.toolbarBtn} ${styles.btnSecondary}`} disabled={!canUndo} onClick={onUndo}>
                <i className="fas fa-undo" /> Undo
            </button>
            <button className={`${styles.toolbarBtn} ${styles.btnSecondary}`} disabled={!canRedo} onClick={onRedo}>
                <i className="fas fa-redo" /> Redo
            </button>

            <button className={`${styles.toolbarBtn} ${styles.btnExport}`} onClick={onExport} disabled={exporting}>
                <i className="fas fa-file-powerpoint" />
                {exporting ? 'Exporting...' : 'Export PPTX'}
            </button>
        </div>
    );
}
