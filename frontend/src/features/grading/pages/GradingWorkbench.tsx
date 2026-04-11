import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import PDFViewer from '../../../shared/PDFViewer';
import CozeAssistant from '../../../shared/CozeAssistant';
import RubricPanel from '../../../shared/RubricPanel';
import { teacherApi } from '../../../api/api';
import styles from '../styles/gradingWorkbench.module.css';
import chatStyles from '../styles/gradingChat.module.css';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

function normalizePdfUrl(rawUrl) {
    try {
        const urlObj = new URL(rawUrl, `${apiRoot}/`);
        let pathname = urlObj.pathname;

        // Some backends may return already-encoded paths (or even double-encoded).
        // Decode a limited number of times, then re-encode by segment exactly once.
        for (let i = 0; i < 2; i += 1) {
            const decoded = decodeURIComponent(pathname);
            if (decoded === pathname) break;
            pathname = decoded;
        }

        const normalizedPath = pathname
            .split('/')
            .map((segment) => (segment ? encodeURIComponent(segment) : ''))
            .join('/');

        urlObj.pathname = normalizedPath;
        return urlObj.toString();
    } catch {
        return rawUrl;
    }
}

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
    const [activePane, setActivePane] = useState('assistant');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                // Try v2 bundle first; fall back to legacy detail only on 404
                let data;
                try {
                    data = await teacherApi.getSubmissionDetailV2(submissionId);
                } catch (v2Err) {
                    if (v2Err.response && v2Err.response.status !== 404) {
                        throw v2Err;
                    }
                    data = await teacherApi.getSubmissionDetail(submissionId);
                }
                setDetail({
                    course: data.course || presetCourse,
                    assignment: data.assignment || presetAssignment,
                    submission: data.submission,
                    annotationsStore: data.annotations,
                    grade: data.grade || null,
                });
                setAnnotations(data.annotations?.annotations || []);
                setHasUnsavedLabelChanges(false);
                setPdfVersion(Date.now());
            } catch (err) {
                const status = err?.response?.status;
                if (status === 401) {
                    setError('Session expired — please log in again.');
                } else if (status === 403) {
                    setError('You do not have permission to view this submission.');
                } else if (status === 404) {
                    setError('Submission not found.');
                } else {
                    setError('Failed to load submission.');
                }
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
        const normalized = normalizePdfUrl(rawPath);
        return `${normalized}${normalized.includes('?') ? '&' : '?'}v=${pdfVersion}`;
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
            setDetail((prev) => prev ? {
                ...prev,
                grade: { totalScore, rubricScores, overallFeedback },
            } : prev);
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
                <div className={styles.topTabs}>
                    <button
                        type="button"
                        className={`${styles.topTabBtn} ${activePane === 'assistant' ? styles.topTabBtnActive : ''}`}
                        onClick={() => setActivePane('assistant')}
                    >
                        <i className="fas fa-robot" /> PDF + Coze Assistant
                    </button>
                    <button
                        type="button"
                        className={`${styles.topTabBtn} ${activePane === 'scorer' ? styles.topTabBtnActive : ''}`}
                        onClick={() => setActivePane('scorer')}
                    >
                        <i className="fas fa-check-circle" /> PDF + Grader
                    </button>
                </div>

                <div className={styles.gridTwoCols}>
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

                    <div key={activePane} className={`${styles.pane} ${styles.rightPaneAnimated}`}>
                        {activePane === 'assistant' ? (
                            <div className={`${chatStyles.cozeWrapper} ${styles.pane} ${chatStyles.chatPane}`}>
                                <CozeAssistant
                                    submissionId={submissionId}
                                    assignment={detail?.assignment}
                                    rubric={detail?.assignment?.rubric}
                                    onAnalysis={() => { }}
                                    className={chatStyles}
                                    provider={provider}
                                    setProvider={setProvider}
                                />
                            </div>
                        ) : (
                            <div className={`${styles.card} ${styles.pane} ${styles.scorePane}`}>
                                <RubricPanel
                                    rubric={detail?.assignment?.rubric || {}}
                                    existingScores={detail?.grade || detail?.annotationsStore}
                                    onSave={handleSaveScores}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}