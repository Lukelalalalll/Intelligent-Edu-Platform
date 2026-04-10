import client from './client';

export interface TeacherCopilotBriefPayload {
    course_section_id?: string | null;
    include_actions?: boolean;
    horizon_days?: number;
}

export interface TeacherCopilotSummary {
    total_courses: number;
    total_pending_submissions: number;
    total_graded_submissions: number;
}

export interface TeacherCopilotCourseRisk {
    course_section_id: string;
    course_name: string;
    assignment_count: number;
    pending_submissions: number;
    graded_submissions: number;
    risk_level: 'high' | 'medium' | 'low';
}

export interface TeacherCopilotBrief {
    brief_id: string;
    teacher_id: string;
    course_section_id?: string | null;
    horizon_days: number;
    summary: TeacherCopilotSummary;
    courses: TeacherCopilotCourseRisk[];
    actions: string[];
    created_at?: string;
    updated_at?: string;
}

export interface TeacherCopilotAgendaItem {
    rank: number;
    assignment_id: string;
    title: string;
    action: string;
}

export interface TeacherCopilotAgendaResponse {
    success: boolean;
    course_section_id: string;
    course_name: string;
    agenda: TeacherCopilotAgendaItem[];
}

export const teacherCopilotApi = {
    createBrief: async (payload: TeacherCopilotBriefPayload): Promise<{ success: boolean; brief_id: string; summary: TeacherCopilotSummary; courses: TeacherCopilotCourseRisk[]; actions: string[] }> => {
        const res = await client.post('/teacher/copilot/brief', payload);
        return res.data;
    },

    getBrief: async (briefId: string): Promise<{ success: boolean; brief: TeacherCopilotBrief }> => {
        const res = await client.get(`/teacher/copilot/brief/${briefId}`);
        return res.data;
    },

    getAgenda: async (courseSectionId: string): Promise<TeacherCopilotAgendaResponse> => {
        const res = await client.get('/teacher/copilot/agenda', { params: { course_section_id: courseSectionId } });
        return res.data;
    },
};
