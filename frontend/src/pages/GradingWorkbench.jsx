import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import PDFViewer from '../components/PDFViewer';
import CozeAssistant from '../components/CozeAssistant';
import RubricPanel from '../components/RubricPanel';
import { teacherApi } from '../services/api';
import styles from '../styles/gradingWorkbench.module.css';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

export default function GradingWorkbench() {
    const { submissionId } = useParams();
    const location = useLocation();
    const presetAssignment = location.state?.assignment;
    const presetCourse = location.state?.course;

    const [detail, setDetail] = useState(null);
    const [annotations, setAnnotations] = useState([]);
    const [isFinalSaving, setIsFinalSaving] = useState(false);
    const [hasUnsavedLabelChanges, setHasUnsavedLabelChanges] = useState(false);
    const [pdfVersion, setPdfVersion] = useState(Date.now());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const data = await teacherApi.getSubmissionDetail(submissionId);
                setDetail({
                    course: data.course || presetCourse,
                    assignment: data.assignment || presetAssignment,
                    submission: data.submission,
                    annotationsStore: data.annotations,
                });
                setAnnotations(data.annotations?.annotations || []);
                setHasUnsavedLabelChanges(false);
                setPdfVersion(Date.now());
            } catch (err) {
                setError('Failed to load submission');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [submissionId]);

    const pdfUrl = useMemo(() => {
        if (!detail?.submission?.pdfPath) return '';
        const rawPath = detail.submission.pdfPath.startsWith('http')
            ? detail.submission.pdfPath
            : `${apiRoot}/${detail.submission.pdfPath}`;
        const path = encodeURI(rawPath);
        return `${path}${path.includes('?') ? '&' : '?'}v=${pdfVersion}`;
    }, [detail, pdfVersion]);

    const handleSaveAnnotation = async (annotation) => {
        const updated = {
            ...annotation,
            id: annotation.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: annotation.timestamp || new Date().toISOString(),
        };
        setAnnotations((prev) => {
            const existingIdx = prev.findIndex((a) => a.id === updated.id);
            if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx] = updated;
                return next;
            }
            return [...prev, updated];
        });
        setHasUnsavedLabelChanges(true);
        return updated;
    };

    const handleDeleteAnnotation = async (annotationId) => {
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
        setHasUnsavedLabelChanges(true);
    };

    const handleFinalizeAnnotations = async () => {
        try {
            setIsFinalSaving(true);
            setError('');
            const res = await teacherApi.finalizeAnnotations(submissionId, annotations);
            setAnnotations(res.annotations || []);
            setHasUnsavedLabelChanges(false);
            setPdfVersion(Date.now());
            setDetail((prev) => {
                if (!prev) return prev;
                const nextPath = res.pdfPath || prev.submission?.pdfPath;
                return {
                    ...prev,
                    submission: {
                        ...prev.submission,
                        pdfPath: nextPath,
                    },
                };
            });
        } catch (err) {
            setError('Failed to finalize annotations to PDF');
        } finally {
            setIsFinalSaving(false);
        }
    };

    const handleSaveScores = async ({ totalScore, rubricScores, overallFeedback }) => {
        try {
            await teacherApi.saveScore(submissionId, {
                submissionId,
                totalScore,
                rubricScores,
                overallFeedback,
            });
        } catch (err) {
            setError('Failed to save scores');
        }
    };

    return (
        <div className={styles.page}>
            {error && <div className={styles.alertDanger} style={{ margin: '0 auto 12px', maxWidth: 1600 }}>{error}</div>}
            {loading && (
                <div className={styles.loading} style={{ margin: '0 auto 12px', maxWidth: 1600 }}>
                    <div className={styles.spinnerBorder}></div>
                    <p>Loading submission data...</p>
                </div>
            )}

            <div className={styles.contentShell}>
                <div className={styles.grid}>
                    <div className={`${styles.card} ${styles.pane} ${styles.pdfPane} ${styles.animatedElement} ${styles.delay1}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.tag}><i className="fas fa-file-pdf" /> PDF Viewer</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {hasUnsavedLabelChanges && <div className={styles.tag} style={{ background: 'rgba(245,158,11,0.15)', color: '#92400e' }}>Draft Labels</div>}
                                <button
                                    type="button"
                                    onClick={handleFinalizeAnnotations}
                                    disabled={isFinalSaving || !hasUnsavedLabelChanges}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: 999,
                                        border: 'none',
                                        background: isFinalSaving || !hasUnsavedLabelChanges ? '#94a3b8' : '#0f766e',
                                        color: '#fff',
                                        fontWeight: 700,
                                        cursor: isFinalSaving || !hasUnsavedLabelChanges ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {isFinalSaving ? 'Saving To PDF...' : 'Finalize Save To PDF'}
                                </button>
                                <div className={styles.tag}><i className="fas fa-map-marker-alt" /> {detail?.submission?.studentName || 'Student'}</div>
                            </div>
                        </div>
                        <PDFViewer
                            file={pdfUrl}
                            annotations={annotations}
                            onSaveAnnotation={handleSaveAnnotation}
                            onDeleteAnnotation={handleDeleteAnnotation}
                        />
                    </div>

                    <div className={`${styles.cozeWrapper} ${styles.pane} ${styles.chatPane} ${styles.animatedElement} ${styles.delay2}`}>
                        <CozeAssistant
                            submissionId={submissionId}
                            assignment={detail?.assignment}
                            rubric={detail?.assignment?.rubric}
                            onAnalysis={() => { }}
                            className={styles}
                        />
                    </div>

                    <div className={`${styles.card} ${styles.pane} ${styles.scorePane} ${styles.animatedElement} ${styles.delay3}`}>
                        <RubricPanel
                            rubric={detail?.assignment?.rubric || {}}
                            existingScores={detail?.annotationsStore}
                            onSave={handleSaveScores}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}