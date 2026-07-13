import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teacherApi } from '@/api/mailboxApi';
import type { Annotation as ApiAnnotation } from '@/types/api';
import type {
    UseGradingSubmissionDataReturn,
    WorkbenchAnnotation,
    WorkbenchAssignment,
    WorkbenchCourse,
    WorkbenchGrade,
    WorkbenchSubmissionDetail,
    WorkbenchSubmissionMeta,
} from '../types/workbench';

interface SubmissionDetailResponse {
    course?: WorkbenchCourse | null;
    assignment?: WorkbenchAssignment | null;
    submission?: WorkbenchSubmissionMeta;
    annotations?: (({ annotations?: WorkbenchAnnotation[] } & WorkbenchGrade) | WorkbenchAnnotation[]) | null;
    grade?: WorkbenchGrade | null;
}

export function mapSubmissionLoadError(err: unknown): string {
    const status = (err as { response?: { status?: number } })?.response?.status;

    if (status === 401) {
        return 'Session expired - please log in again.';
    }
    if (status === 403) {
        return 'You do not have permission to view this submission.';
    }
    if (status === 404) {
        return 'Submission not found.';
    }
    return 'Failed to load submission.';
}

export function mergeSubmissionDetailResponse(
    data: SubmissionDetailResponse,
    presetAssignment?: WorkbenchAssignment | null,
    presetCourse?: WorkbenchCourse | null,
): WorkbenchSubmissionDetail {
    return {
        course: data.course || presetCourse || null,
        assignment: data.assignment || presetAssignment || null,
        submission: data.submission || {},
        annotationsStore: Array.isArray(data.annotations) ? null : data.annotations || null,
        grade: data.grade || null,
    };
}

export function upsertAnnotationById(
    annotations: WorkbenchAnnotation[],
    nextAnnotation: WorkbenchAnnotation,
): WorkbenchAnnotation[] {
    const existingIdx = annotations.findIndex((annotation) => annotation.id === nextAnnotation.id);
    if (existingIdx >= 0) {
        const next = [...annotations];
        next[existingIdx] = nextAnnotation;
        return next;
    }
    return [...annotations, nextAnnotation];
}

export function useGradingSubmissionData(
    submissionId: string | undefined,
    presetAssignment?: WorkbenchAssignment | null,
    presetCourse?: WorkbenchCourse | null,
): UseGradingSubmissionDataReturn {
    const isMounted = useRef(true);

    const [detail, setDetail] = useState<WorkbenchSubmissionDetail | null>(null);
    const [annotations, setAnnotations] = useState<WorkbenchAnnotation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hasUnsavedLabelChanges, setHasUnsavedLabelChanges] = useState(false);
    const [pdfVersion, setPdfVersion] = useState(Date.now());
    const [isFinalSaving, setIsFinalSaving] = useState(false);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const setSafeError = useCallback((message: string, autoClearMs = 0) => {
        if (!isMounted.current) {
            return;
        }

        setError(message);

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
            if (!submissionId) {
                return;
            }

            try {
                setLoading(true);
                let data: SubmissionDetailResponse;

                try {
                    data = await teacherApi.getSubmissionDetailV2(submissionId) as SubmissionDetailResponse;
                } catch (v2Err: any) {
                    const status = v2Err?.response?.status;
                    if (status && status >= 400 && status < 500 && status !== 404) {
                        throw v2Err;
                    }
                    data = await teacherApi.getSubmissionDetail(submissionId) as unknown as SubmissionDetailResponse;
                }

                if (!isMounted.current) {
                    return;
                }

                setDetail(mergeSubmissionDetailResponse(data, presetAssignment, presetCourse));
                setAnnotations(
                    Array.isArray(data.annotations)
                        ? data.annotations
                        : Array.isArray(data.annotations?.annotations)
                            ? data.annotations.annotations
                            : [],
                );
                setHasUnsavedLabelChanges(false);
                setPdfVersion(Date.now());
            } catch (err) {
                if (isMounted.current) {
                    setError(mapSubmissionLoadError(err));
                }
            } finally {
                if (isMounted.current) {
                    setLoading(false);
                }
            }
        };

        load();
    }, [submissionId, presetAssignment, presetCourse]);

    const saveAnnotation = useCallback(async (annotation: WorkbenchAnnotation) => {
        const updated = {
            ...annotation,
            id: annotation.id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: annotation.timestamp || new Date().toISOString(),
        };

        setAnnotations((prev) => upsertAnnotationById(prev, updated));
        setHasUnsavedLabelChanges(true);

        return updated;
    }, []);

    const deleteAnnotation = useCallback(async (annotationId: string) => {
        setAnnotations((prev) => prev.filter((annotation) => annotation.id !== annotationId));
        setHasUnsavedLabelChanges(true);
    }, []);

    const finalizeAnnotations = useCallback(async () => {
        if (!submissionId) {
            return;
        }

        try {
            setIsFinalSaving(true);
            setError('');
            const result = await teacherApi.finalizeAnnotations(
                submissionId,
                annotations as unknown as ApiAnnotation[],
            );

            if (!isMounted.current) {
                return;
            }

            setAnnotations(Array.isArray(result?.annotations) ? result.annotations : []);
            setHasUnsavedLabelChanges(false);
            setPdfVersion(Date.now());
            setDetail((prev) => {
                if (!prev) {
                    return prev;
                }

                const nextPath = result?.pdfPath || prev.submission?.pdfPath;
                return {
                    ...prev,
                    submission: {
                        ...prev.submission,
                        pdfPath: nextPath,
                    },
                };
            });
        } catch {
            setSafeError('Failed to finalize annotations to PDF', 3000);
        } finally {
            if (isMounted.current) {
                setIsFinalSaving(false);
            }
        }
    }, [annotations, setSafeError, submissionId]);

    const saveScores = useCallback(async ({ totalScore, rubricScores, overallFeedback }: WorkbenchGrade) => {
        if (!submissionId) {
            return;
        }

        try {
            await teacherApi.saveScore(submissionId, {
                submissionId,
                totalScore,
                rubricScores,
                overallFeedback,
            });

            if (isMounted.current) {
                setDetail((prev) => (prev
                    ? {
                        ...prev,
                        grade: { totalScore, rubricScores, overallFeedback },
                    }
                    : prev));
            }
        } catch {
            setSafeError('Failed to save scores', 3000);
        }
    }, [setSafeError, submissionId]);

    const actions = useMemo(() => ({
        saveAnnotation,
        deleteAnnotation,
        finalizeAnnotations,
        saveScores,
    }), [deleteAnnotation, finalizeAnnotations, saveAnnotation, saveScores]);

    const state = useMemo(() => ({
        detail,
        annotations,
        loading,
        error,
        hasUnsavedLabelChanges,
        pdfVersion,
        isFinalSaving,
    }), [annotations, detail, error, hasUnsavedLabelChanges, isFinalSaving, loading, pdfVersion]);

    return { state, actions };
}
