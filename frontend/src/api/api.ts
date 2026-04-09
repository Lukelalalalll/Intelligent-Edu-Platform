import client from './client';
import type {
    Course,
    Assignment,
    Submission,
    SubmissionDetail,
    Annotation,
    ScorePayload,
    ChatMessage,
} from '../types/api';
import type { AIProvider } from '../shared/aiProvider';

export const teacherApi = {
    getCourses: (): Promise<{ courses: Course[] }> => client.get('/grading/courses').then(r => r.data),
    getAssignments: (courseId: string): Promise<Assignment[]> => client.get(`/teacher/assignments/${courseId}`).then(r => r.data),
    getSubmissions: (assignmentId: string): Promise<Submission[]> => client.get(`/teacher/submissions/${assignmentId}`).then(r => r.data),
    getSubmissionDetail: (submissionId: string): Promise<SubmissionDetail> => client.get(`/teacher/submission/${submissionId}`).then(r => r.data),
    saveAnnotation: (submissionId: string, annotation: Annotation) => client.post('/grading/annotations', { submissionId, annotation }).then(r => r.data),
    deleteAnnotation: (submissionId: string, annotationId: string) => client.delete(`/grading/annotations/${annotationId}`, { params: { submissionId } }).then(r => r.data),
    finalizeAnnotations: (submissionId: string, annotations: Annotation[]) => client.post(`/teacher/submission/${submissionId}/annotations/finalize`, { submissionId, annotations }).then(r => r.data),
    saveScore: (submissionId: string, payload: ScorePayload) => client.post(`/teacher/submission/${submissionId}/score`, payload).then(r => r.data),

    // v2 flat-model endpoints
    getCoursesV2: (): Promise<{ courses: Course[] }> => client.get('/teacher/v2/courses').then(r => r.data),
    getAssignmentsV2: (courseSectionId: string) => client.get(`/teacher/v2/assignments/${courseSectionId}`).then(r => r.data),
    getSubmissionsV2: (assignmentId: string) => client.get(`/teacher/v2/submissions/${assignmentId}`).then(r => r.data),
    getSubmissionDetailV2: (submissionId: string) => client.get(`/teacher/v2/submission/${submissionId}`).then(r => r.data),
};

export const studentApi = {
    getCourses: (): Promise<{ courses: Course[] }> => client.get('/v2/profile/courses').then(r => r.data),
    getAssignments: (courseSectionId: string) => client.get(`/v2/student/assignments/${courseSectionId}`).then(r => r.data),
    submitWork: (assignmentId: string, file: File) => {
        const formData = new FormData();
        formData.append('assignmentId', assignmentId);
        formData.append('file', file);
        return client.post('/v2/student/submit', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data);
    },
};

export const cozeApi = {
    analyzeSubmission: (submissionId: string, provider: AIProvider = 'local_ollama') =>
        client.post('/ai/gateway/analyze', { submissionId, provider }).then(r => r.data),
    debugRag: (submissionId: string, selectedText: string, options: { useRag?: boolean; ragTopK?: number } = {}) =>
        client.post('/ai/gateway/rag/debug', {
            submissionId,
            selectedText,
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
    askFeedback: (
        submissionId: string,
        selectedText: string,
        assignment: string | undefined,
        rubric: Record<string, unknown> | undefined,
        messages: ChatMessage[] = [],
        options: { useRag?: boolean; ragTopK?: number; provider?: AIProvider } = {},
    ) =>
        client.post('/ai/gateway/feedback', {
            submissionId,
            selectedText,
            assignment,
            rubric,
            messages,
            provider: options.provider || 'local_ollama',
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
    suggestAnnotation: (
        submissionId: string,
        selectedText: string,
        assignment: string | undefined,
        rubric: Record<string, unknown> | undefined,
        messages: ChatMessage[] = [],
        options: { useRag?: boolean; ragTopK?: number; provider?: AIProvider } = {},
    ) =>
        client.post('/ai/gateway/annotate', {
            submissionId,
            selectedText,
            assignment,
            rubric,
            messages,
            provider: options.provider || 'local_ollama',
            useRag: options.useRag ?? true,
            ragTopK: options.ragTopK ?? 4,
        }).then(r => r.data),
};
