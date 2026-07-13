/**
 * mailboxApi — canonical teacher + student REST API clients scoped to the mailbox domain.
 */
import client from '@/shared/api/client';
import type {
    Course as LegacyCourse,
    Assignment as LegacyAssignment,
    Submission as LegacySubmission,
    SubmissionDetail,
    Annotation,
    ScorePayload,
} from '@/types/api';
import type {
    Course,
    Assignment,
    Submission,
} from '../types';

export const teacherApi = {
    getCourses: (): Promise<{ courses: LegacyCourse[] }> =>
        client.get('/grading/courses').then(r => r.data),
    getAssignments: (courseId: string): Promise<LegacyAssignment[]> =>
        client.get(`/teacher/assignments/${courseId}`).then(r => r.data),
    getSubmissions: (assignmentId: string): Promise<LegacySubmission[]> =>
        client.get(`/teacher/submissions/${assignmentId}`).then(r => r.data),
    getSubmissionDetail: (submissionId: string): Promise<SubmissionDetail> =>
        client.get(`/teacher/submission/${submissionId}`).then(r => r.data),
    saveAnnotation: (submissionId: string, annotation: Annotation) =>
        client.post('/grading/annotations', { submissionId, annotation }).then(r => r.data),
    deleteAnnotation: (submissionId: string, annotationId: string) =>
        client.delete(`/grading/annotations/${annotationId}`, { params: { submissionId } }).then(r => r.data),
    finalizeAnnotations: (submissionId: string, annotations: Annotation[]) =>
        client.post(`/grading/submission/${submissionId}/annotations/finalize`, { submissionId, annotations }).then(r => r.data),
    saveScore: (submissionId: string, payload: ScorePayload) =>
        client.post(`/grading/submission/${submissionId}/score`, payload).then(r => r.data),

    // v2 flat-model endpoints
    getCoursesV2: (): Promise<{ courses: Course[] }> =>
        client.get('/teacher/v2/courses').then(r => r.data),
    getAssignmentsV2: (courseSectionId: string): Promise<{ assignments: Assignment[] }> =>
        client.get(`/teacher/v2/assignments/${courseSectionId}`).then(r => r.data),
    getSubmissionsV2: (assignmentId: string): Promise<{ submissions: Submission[] }> =>
        client.get(`/teacher/v2/submissions/${assignmentId}`).then(r => r.data),
    getSubmissionDetailV2: (submissionId: string) =>
        client.get(`/teacher/v2/submission/${submissionId}`).then(r => r.data),
};

export const studentApi = {
    getCourses: (): Promise<{ courses: LegacyCourse[] }> =>
        client.get('/v2/profile/courses').then(r => r.data),
    getAssignments: (courseId: string) =>
        client.get(`/v2/student/assignments/${courseId}`).then(r => r.data),
    getMySubmissions: () =>
        client.get('/v2/student/my-submissions').then(r => r.data),
    submitWork: (assignmentId: string, file: File) => {
        const formData = new FormData();
        formData.append('assignmentId', assignmentId);
        formData.append('file', file);
        return client.post('/v2/student/submit', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data);
    },
};
