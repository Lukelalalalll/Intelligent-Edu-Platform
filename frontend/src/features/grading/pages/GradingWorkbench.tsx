import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import PDFViewer from '../components/PDFViewer';
import CozeAssistant from '../components/CozeAssistant';
import RubricPanel from '../components/RubricPanel';
import { teacherApi } from '../../../api/mailboxApi';
import styles from '../styles/gradingWorkbench.module.css';
import chatStyles from '../styles/gradingChat.module.css';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

// ==========================================
// Phase 1: TypeScript Types
// ==========================================

export interface Annotation {
    id?: string;
    timestamp?: string;
    [key: string]: any; // Extendable for specific annotation properties
}

export interface Grade {
    totalScore?: number;
    rubricScores?: Record<string, any>;
    overallFeedback?: string;
}

export interface SubmissionDetail {
    course: any;
    assignment: any;
    submission: {
        pdfPath?: string;
        studentName?: string;
        [key: string]: any;
    };
    annotationsStore?: any;
    grade: Grade | null;
}

export interface UseSubmissionDataReturn {
    state: {
        detail: SubmissionDetail | null;
        annotations: Annotation[];
        loading: boolean;
        error: string;
        hasUnsavedLabelChanges: boolean;
        pdfVersion: number;
        isFinalSaving: boolean;
    };
    actions: {
        saveAnnotation: (annotation: Annotation) => Promise<Annotation>;
        deleteAnnotation: (annotationId: string) => Promise<void>;
        finalizeAnnotations: () => Promise<void>;
        saveScores: (data: Grade) => Promise<void>;
    };
}

// ==========================================
// Phase 3: Pure Function Extraction
// ==========================================

function normalizePdfUrl(rawUrl: string): string {
    try {
        const urlObj = new URL(rawUrl, `${apiRoot}/`);
        let pathname = urlObj.pathname;

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

// ==========================================
// Phase 2: State Encapsulation (Custom Hook)
// ==========================================

function useSubmissionData(
    submissionId: string | undefined,
    presetAssignment: any,
    presetCourse: any
): UseSubmissionDataReturn {
    const isMounted = useRef(true);
    
    const [detail, setDetail] = useState<SubmissionDetail | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hasUnsavedLabelChanges, setHasUnsavedLabelChanges] = useState(false);
    const [pdfVersion, setPdfVersion] = useState(Date.now());
    const [isFinalSaving, setIsFinalSaving] = useState(false);

    // Track unmount status to prevent memory leaks
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const setSafeError = useCallback((msg: string, autoClearMs = 0) => {
        if (!isMounted.current) return;
        setError(msg);
        if (autoClearMs > 0) {
            setTimeout(() => {
                if (isMounted.current) {
                    setError('');
                }
            }, autoClearMs);
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            if (!submissionId) return;
            try {
                setLoading(true);
                let data;
                try {
                    data = await teacherApi.getSubmissionDetailV2(submissionId);
                } catch (v2Err: any) {
                    if (v2Err.response && v2Err.response.status !== 404) {
                        throw v2Err;
                    }
                    data = await teacherApi.getSubmissionDetail(submissionId);
                }
                
                if (isMounted.current) {
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
                }
            } catch (err: any) {
                if (!isMounted.current) return;
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
                if (isMounted.current) {
                    setLoading(false);
                }
            }
        };
        load();
    }, [submissionId, presetAssignment, presetCourse]);

    const saveAnnotation = useCallback(async (annotation: Annotation) => {
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
    }, []);

    const deleteAnnotation = useCallback(async (annotationId: string) => {
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
        setHasUnsavedLabelChanges(true);
    }, []);

    const finalizeAnnotations = useCallback(async () => {
        if (!submissionId) return;
        try {
            setIsFinalSaving(true);
            setError('');
            const res = await teacherApi.finalizeAnnotations(submissionId, annotations);
            if (!isMounted.current) return;
            
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
            setSafeError('Failed to finalize annotations to PDF', 3000);
        } finally {
            if (isMounted.current) {
                setIsFinalSaving(false);
            }
        }
    }, [submissionId, annotations, setSafeError]);

    const saveScores = useCallback(async ({ totalScore, rubricScores, overallFeedback }: Grade) => {
        if (!submissionId) return;
        try {
            await teacherApi.saveScore(submissionId, {
                submissionId,
                totalScore,
                rubricScores,
                overallFeedback,
            });
            if (isMounted.current) {
                setDetail((prev) => prev ? {
                    ...prev,
                    grade: { totalScore, rubricScores, overallFeedback },
                } : prev);
            }
        } catch (err) {
            setSafeError('Failed to save scores', 3000);
        }
    }, [submissionId, setSafeError]);

    return {
        state: {
            detail,
            annotations,
            loading,
            error,
            hasUnsavedLabelChanges,
            pdfVersion,
            isFinalSaving
        },
        actions: {
            saveAnnotation,
            deleteAnnotation,
            finalizeAnnotations,
            saveScores
        }
    };
}

export default function GradingWorkbench() {
    const { submissionId } = useParams();
    const location = useLocation();
    const presetAssignment = location.state?.assignment;
    const presetCourse = location.state?.course;

    const { state, actions } = useSubmissionData(submissionId, presetAssignment, presetCourse);
    const { detail, annotations, loading, error, hasUnsavedLabelChanges, pdfVersion, isFinalSaving } = state;

    const [activePane, setActivePane] = useState('assistant');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    const pdfUrl = useMemo(() => {
        if (!detail?.submission?.pdfPath) return '';
        const rawPath = detail.submission.pdfPath.startsWith('http')
            ? detail.submission.pdfPath
            : `${apiRoot}/${detail.submission.pdfPath}`;
        const normalized = normalizePdfUrl(rawPath);
        return `${normalized}${normalized.includes('?') ? '&' : '?'}v=${pdfVersion}`;
    }, [detail, pdfVersion]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedLabelChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedLabelChanges]);

    return (
        <div className={styles.page}>
            {error && <div className={styles.alertDanger} style={{ margin: '0 auto 12px', maxWidth: 1600 }}>{error}</div> /* TODO: Move to CSS Module */}
            {loading && (
                // TODO: Move inline styles to CSS Module
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
                            {/* TODO: Move flex gap and alignItems to standard className */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {/* TODO: Move background and color styles to standard className */}
                                {hasUnsavedLabelChanges && <div className={styles.tag} style={{ background: 'rgba(245,158,11,0.15)', color: '#92400e' }}>Draft Labels</div>}
                                <button
                                    type="button"
                                    onClick={actions.finalizeAnnotations}
                                    disabled={isFinalSaving || !hasUnsavedLabelChanges}
                                    className={isFinalSaving || !hasUnsavedLabelChanges ? styles.finalizeBtnDisabled : styles.finalizeBtn}
                                >
                                    {isFinalSaving ? 'Saving To PDF...' : 'Finalize Save To PDF'}
                                </button>
                                <div className={styles.tag}><i className="fas fa-map-marker-alt" /> {detail?.submission?.studentName || 'Student'}</div>
                            </div>
                        </div>
                        <PDFViewer
                            file={pdfUrl}
                            annotations={annotations}
                            onSaveAnnotation={actions.saveAnnotation}
                            onDeleteAnnotation={actions.deleteAnnotation}
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
                                    onSave={actions.saveScores}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}