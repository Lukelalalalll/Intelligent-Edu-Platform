import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import GradingAssistantPanel from '../components/GradingAssistantPanel';
import GradingDocumentPanel from '../components/GradingDocumentPanel';
import GradingScoringPanel from '../components/GradingScoringPanel';
import WorkbenchPaneTabs from '../components/WorkbenchPaneTabs';
import { useGradingSubmissionData } from '../hooks/useGradingSubmissionData';
import styles from '../styles/gradingWorkbench.module.css';
import type {
    WorkbenchGrade,
    WorkbenchLocationState,
    WorkbenchPane,
} from '../types/workbench';
import {
    buildPdfUrl,
    extractGradeFromAnalysis,
    selectCurrentRubric,
    selectCurrentScores,
} from '../utils/workbench';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

export default function GradingWorkbench() {
    const { submissionId } = useParams();
    const location = useLocation();
    const locationState = location.state as WorkbenchLocationState | null | undefined;
    const presetAssignment = locationState?.assignment;
    const presetCourse = locationState?.course;

    const { state, actions } = useGradingSubmissionData(submissionId, presetAssignment, presetCourse);
    const { detail, annotations, loading, error, hasUnsavedLabelChanges, pdfVersion, isFinalSaving } = state;

    const [activePane, setActivePane] = useState<WorkbenchPane>('assistant');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());
    const [aiSuggestedGrade, setAiSuggestedGrade] = useState<WorkbenchGrade | null>(null);

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    useEffect(() => {
        setAiSuggestedGrade(null);
    }, [submissionId]);

    const pdfUrl = useMemo(
        () => buildPdfUrl(detail?.submission?.pdfPath, pdfVersion),
        [detail?.submission?.pdfPath, pdfVersion],
    );
    const currentRubric = useMemo(() => selectCurrentRubric(detail), [detail]);
    const currentScores = useMemo(() => selectCurrentScores(aiSuggestedGrade, detail), [aiSuggestedGrade, detail]);

    const handleAnalysis = useCallback((analysis: Record<string, unknown>) => {
        const nextGrade = extractGradeFromAnalysis(analysis);
        if (!nextGrade) {
            return;
        }

        setAiSuggestedGrade(nextGrade);
        setActivePane('scorer');
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (hasUnsavedLabelChanges) {
                event.preventDefault();
                event.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedLabelChanges]);

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
                <WorkbenchPaneTabs activePane={activePane} onChange={setActivePane} />

                <div className={styles.gridTwoCols}>
                    <GradingDocumentPanel
                        pdfUrl={pdfUrl}
                        annotations={annotations}
                        hasUnsavedLabelChanges={hasUnsavedLabelChanges}
                        isFinalSaving={isFinalSaving}
                        studentName={detail?.submission?.studentName}
                        onFinalize={actions.finalizeAnnotations}
                        onSaveAnnotation={actions.saveAnnotation}
                        onDeleteAnnotation={actions.deleteAnnotation}
                    />

                    <div key={activePane} className={`${styles.pane} ${styles.rightPaneAnimated}`}>
                        {activePane === 'assistant' ? (
                            <GradingAssistantPanel
                                submissionId={submissionId}
                                assignment={detail?.assignment}
                                rubric={currentRubric}
                                onAnalysis={handleAnalysis}
                                provider={provider}
                                setProvider={setProvider}
                            />
                        ) : (
                            <GradingScoringPanel
                                rubric={currentRubric}
                                existingScores={currentScores}
                                onSave={actions.saveScores}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
