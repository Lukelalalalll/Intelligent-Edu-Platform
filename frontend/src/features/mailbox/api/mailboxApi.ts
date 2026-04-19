/**
 * mailboxApi — teacher + student REST API clients scoped to the mailbox feature.
 */
import client from '@/shared/api/client';
import type { Course, Assignment, Submission } from '../types';

export const teacherApi = {
    // v2 flat-model endpoints
    getCoursesV2: (): Promise<{ courses: Course[] }> =>
        client.get('/teacher/v2/courses').then(r => r.data),
    getAssignmentsV2: (courseSectionId: string): Promise<{ assignments: Assignment[] }> =>
        client.get(`/teacher/v2/assignments/${courseSectionId}`).then(r => r.data),
    getSubmissionsV2: (assignmentId: string): Promise<{ submissions: Submission[] }> =>
        client.get(`/teacher/v2/submissions/${assignmentId}`).then(r => r.data),
};
