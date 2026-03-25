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
    const [selectedAnnotation, setSelectedAnnotation] = useState(null);
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
        const path = detail.submission.pdfPath.startsWith('http')
            ? detail.submission.pdfPath
            : `${apiRoot}/${detail.submission.pdfPath}`;
        return path;
    }, [detail]);

    const handleAddAnnotation = async (annotation) => {
        try {
            const res = await teacherApi.saveAnnotation(submissionId, annotation);
            const updated = res.annotation;
            setAnnotations((prev) => {
                const existingIdx = prev.findIndex((a) => a.id === updated.id);
                if (existingIdx >= 0) {
                    const next = [...prev];
                    next[existingIdx] = updated;
                    return next;
                }
                return [...prev, updated];
            });
            setSelectedAnnotation(updated);
        } catch (err) {
            setError('Failed to save annotation');
        }
    };

    const handleDeleteAnnotation = async (ann) => {
        try {
            await teacherApi.deleteAnnotation(submissionId, ann.id);
            setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
            setSelectedAnnotation(null);
        } catch (err) {
            setError('Failed to delete annotation');
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
                            <div className={styles.tag}><i className="fas fa-map-marker-alt" /> {detail?.submission?.studentName || 'Student'}</div>
                        </div>
                        <PDFViewer
                            file={pdfUrl}
                            annotations={annotations}
                            onAddAnnotation={handleAddAnnotation}
                            onSelectAnnotation={setSelectedAnnotation}
                        />
                        {selectedAnnotation && (
                            <div className={`${styles.card} ${styles.subCard}`}>
                                <div className={styles.cardHeader}>
                                    <div style={{ fontWeight: 700 }}>Selected Annotation</div>
                                    <button onClick={() => handleDeleteAnnotation(selectedAnnotation)} className={styles.ghostBtn} style={{ color: '#b91c1c' }}>Delete</button>
                                </div>
                                <div className={styles.annotationBox}>
                                    <textarea
                                        value={selectedAnnotation.comment || ''}
                                        rows={3}
                                        onChange={(e) => setSelectedAnnotation({ ...selectedAnnotation, comment: e.target.value })}
                                        onBlur={() => handleAddAnnotation(selectedAnnotation)}
                                    />
                                    {selectedAnnotation.aiSuggestion && (
                                        <div className={styles.annotationFooter}>AI: {selectedAnnotation.aiSuggestion}</div>
                                    )}
                                </div>
                            </div>
                        )}
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