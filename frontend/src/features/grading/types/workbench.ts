export type WorkbenchPane = 'assistant' | 'scorer';

export type WorkbenchRubric = Record<string, number>;

export interface WorkbenchGrade {
    totalScore?: number;
    rubricScores?: Record<string, number>;
    overallFeedback?: string;
}

export interface WorkbenchAnnotation {
    id?: string;
    pageNumber?: number;
    x?: number;
    y?: number;
    title?: string;
    comment?: string;
    aiSuggestion?: string;
    timestamp?: string;
}

export interface WorkbenchAssignment {
    title?: string;
    description?: string;
    rubric?: WorkbenchRubric;
    [key: string]: unknown;
}

export interface WorkbenchCourse {
    [key: string]: unknown;
}

export interface WorkbenchSubmissionMeta {
    pdfPath?: string;
    studentName?: string;
    [key: string]: unknown;
}

export interface WorkbenchSubmissionDetail {
    course: WorkbenchCourse | null;
    assignment: WorkbenchAssignment | null;
    submission: WorkbenchSubmissionMeta;
    annotationsStore?: WorkbenchGrade | null;
    grade: WorkbenchGrade | null;
}

export interface WorkbenchLocationState {
    assignment?: WorkbenchAssignment;
    course?: WorkbenchCourse;
}

export interface UseGradingSubmissionDataReturn {
    state: {
        detail: WorkbenchSubmissionDetail | null;
        annotations: WorkbenchAnnotation[];
        loading: boolean;
        error: string;
        hasUnsavedLabelChanges: boolean;
        pdfVersion: number;
        isFinalSaving: boolean;
    };
    actions: {
        saveAnnotation: (annotation: WorkbenchAnnotation) => Promise<WorkbenchAnnotation>;
        deleteAnnotation: (annotationId: string) => Promise<void>;
        finalizeAnnotations: () => Promise<void>;
        saveScores: (data: WorkbenchGrade) => Promise<void>;
    };
}
