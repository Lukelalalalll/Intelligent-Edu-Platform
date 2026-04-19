// features/mailbox/types.ts

export type DegreeLevel = 'bachelor' | 'master' | 'phd';

export interface Course {
    id: string;
    courseCode: string;
    courseName: string;
    semester?: string;
    degreeLevel?: DegreeLevel;
}

export interface Assignment {
    id: string;
    title: string;
    description?: string;
    dueDate?: string;
    dueAt?: string;
    submissionCount?: number;
    gradedCount?: number;
}

export interface Submission {
    id: string;
    studentName: string;
    studentId?: string;
    submittedAt?: string;
    status: 'graded' | 'pending';
}

export interface MailboxSelections {
    degree: string;
    course: string;
    assignment: string;
}
