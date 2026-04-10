import client from './client';

export interface DiagnosticChapter {
    chapter_id: string;
    course_id: string;
    chapter_name: string;
    chapter_order: number;
    description?: string;
    diagnostic_enabled: boolean;
}

export interface DiagnosticConfig {
    config_id?: string;
    course_id?: string;
    chapter_id: string;
    question_count: number;
    pass_score: number;
    time_limit_minutes: number;
}

export interface DiagnosticFeedback {
    feedback_id: string;
    report_id: string;
    session_id: string;
    course_id: string;
    chapter_id: string;
    student_id: string;
    student_name?: string;
    rating: number;
    comment: string;
    report_score: number;
    report_level: string;
    created_at: string;
}

export interface DiagnosticQuestion {
    question_id: string;
    prompt: string;
    max_score: number;
}

export interface DiagnosticReport {
    report_id: string;
    session_id: string;
    course_id: string;
    chapter_id: string;
    overall_score: number;
    level: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    teacher_comment?: string;
    question_results?: Array<{
        question_id: string;
        prompt: string;
        answer: string;
        score: number;
        max_score: number;
        feedback: string;
        doc_name?: string;
    }>;
    created_at: string;
}

export const diagnosticTeacherApi = {
    listChapters: (courseId: string): Promise<{ course_id: string; chapters: DiagnosticChapter[] }> =>
        client.get(`/diagnostic/teacher/chapters/${encodeURIComponent(courseId)}`).then(r => r.data),

    createChapter: (courseId: string, payload: {
        chapter_name: string;
        chapter_order: number;
        description?: string;
        diagnostic_enabled?: boolean;
    }) => client.post(`/diagnostic/teacher/chapters/${encodeURIComponent(courseId)}`, payload).then(r => r.data),

    updateChapter: (chapterId: string, payload: Partial<{
        chapter_name: string;
        chapter_order: number;
        description: string;
        diagnostic_enabled: boolean;
    }>) => client.patch(`/diagnostic/teacher/chapter/${encodeURIComponent(chapterId)}`, payload).then(r => r.data),

    deleteChapter: (chapterId: string) =>
        client.delete(`/diagnostic/teacher/chapter/${encodeURIComponent(chapterId)}`).then(r => r.data),

    getConfig: (chapterId: string): Promise<{ config: DiagnosticConfig }> =>
        client.get(`/diagnostic/teacher/config/${encodeURIComponent(chapterId)}`).then(r => r.data),

    updateConfig: (chapterId: string, payload: {
        question_count: number;
        pass_score: number;
        time_limit_minutes: number;
    }): Promise<{ config: DiagnosticConfig }> =>
        client.put(`/diagnostic/teacher/config/${encodeURIComponent(chapterId)}`, payload).then(r => r.data),

    listReports: (courseId: string, chapterId: string = ''): Promise<{ reports: DiagnosticReport[] }> =>
        client
            .get(`/diagnostic/teacher/reports/${encodeURIComponent(courseId)}`, {
                params: chapterId ? { chapter_id: chapterId } : {},
            })
            .then(r => r.data),

    listFeedback: (courseId: string, params?: { chapter_id?: string; report_id?: string; min_rating?: number }): Promise<{ feedback: DiagnosticFeedback[] }> =>
        client
            .get(`/diagnostic/teacher/feedback/${encodeURIComponent(courseId)}`, { params: params || {} })
            .then(r => r.data),

    commentReport: (reportId: string, comment: string) =>
        client.post(`/diagnostic/teacher/reports/${encodeURIComponent(reportId)}/comment`, { comment }).then(r => r.data),

    reassignKnowledge: (payload: { course_id: string; doc_name: string; chapter_id: string }) =>
        client.post('/diagnostic/teacher/knowledge/reassign', payload).then(r => r.data),
};

export const diagnosticStudentApi = {
    listChapters: (courseId: string): Promise<{ course_id: string; chapters: DiagnosticChapter[] }> =>
        client.get(`/diagnostic/student/chapters/${encodeURIComponent(courseId)}`).then(r => r.data),

    startSession: (payload: { course_id: string; chapter_id: string }): Promise<{
        session_id: string;
        course_id: string;
        chapter_id: string;
        time_limit_minutes: number;
        questions: DiagnosticQuestion[];
    }> => client.post('/diagnostic/student/sessions/start', payload).then(r => r.data),

    getSession: (sessionId: string) =>
        client.get(`/diagnostic/student/sessions/${encodeURIComponent(sessionId)}`).then(r => r.data),

    submitSession: (sessionId: string, answers: Array<{ question_id: string; answer: string }>): Promise<{ report: DiagnosticReport }> =>
        client.post(`/diagnostic/student/sessions/${encodeURIComponent(sessionId)}/submit`, { answers }).then(r => r.data),

    listReports: (courseId: string = ''): Promise<{ reports: DiagnosticReport[] }> =>
        client
            .get('/diagnostic/student/reports', {
                params: courseId ? { course_id: courseId } : {},
            })
            .then(r => r.data),

    getReport: (reportId: string): Promise<{ report: DiagnosticReport }> =>
        client.get(`/diagnostic/student/reports/${encodeURIComponent(reportId)}`).then(r => r.data),

    sendFeedback: (reportId: string, payload: { rating: number; comment: string }) =>
        client.post(`/diagnostic/student/reports/${encodeURIComponent(reportId)}/feedback`, payload).then(r => r.data),
};
