import { Suspense, lazy } from 'react';
import styles from '../styles/gradingWorkbench.module.css';
import type { WorkbenchAnnotation } from '../types/workbench';

const PDFViewer = lazy(() => import('./PDFViewer'));

interface GradingDocumentPanelProps {
    pdfUrl: string;
    annotations: WorkbenchAnnotation[];
    hasUnsavedLabelChanges: boolean;
    isFinalSaving: boolean;
    studentName?: string;
    onFinalize: () => Promise<void>;
    onSaveAnnotation: (annotation: WorkbenchAnnotation) => Promise<WorkbenchAnnotation>;
    onDeleteAnnotation: (annotationId: string) => Promise<void>;
}

export default function GradingDocumentPanel({
    pdfUrl,
    annotations,
    hasUnsavedLabelChanges,
    isFinalSaving,
    studentName,
    onFinalize,
    onSaveAnnotation,
    onDeleteAnnotation,
}: GradingDocumentPanelProps) {
    return (
        <div className={`${styles.card} ${styles.pane} ${styles.pdfPane} ${styles.animatedElement} ${styles.delay1}`}>
            <div className={styles.cardHeader}>
                <div className={styles.tag}><i className="fas fa-file-pdf" /> PDF Viewer</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {hasUnsavedLabelChanges && (
                        <div className={styles.tag} style={{ background: 'rgba(245,158,11,0.15)', color: '#92400e' }}>
                            Draft Labels
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={onFinalize}
                        disabled={isFinalSaving || !hasUnsavedLabelChanges}
                        className={isFinalSaving || !hasUnsavedLabelChanges ? styles.finalizeBtnDisabled : styles.finalizeBtn}
                    >
                        {isFinalSaving ? 'Saving To PDF...' : 'Finalize Save To PDF'}
                    </button>
                    <div className={styles.tag}><i className="fas fa-map-marker-alt" /> {studentName || 'Student'}</div>
                </div>
            </div>
            <Suspense fallback={<div className={styles.loading} style={{ padding: 20 }}>Loading PDF viewer...</div>}>
                <PDFViewer
                    file={pdfUrl}
                    annotations={annotations}
                    onSaveAnnotation={onSaveAnnotation}
                    onDeleteAnnotation={onDeleteAnnotation}
                />
            </Suspense>
        </div>
    );
}
