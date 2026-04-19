import { useMemo } from 'react';
import type { Course, Submission } from '../types';

const degreeLevels = ['bachelor', 'master', 'phd'] as const;

interface UseMailboxFiltersOptions {
    courses: Course[];
    submissions: Submission[];
    selectedDegree: string;
    searchQuery: string;
}

export function useMailboxFilters({ courses, submissions, selectedDegree, searchQuery }: UseMailboxFiltersOptions) {
    const filteredCourses = useMemo(() => {
        const deg = selectedDegree.toLowerCase();
        if (!deg) return courses;
        return courses.filter(c => (c.degreeLevel || 'bachelor').toLowerCase() === deg);
    }, [courses, selectedDegree]);

    const filteredSubmissions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return submissions;
        return submissions.filter(s =>
            (s.studentName || '').toLowerCase().includes(q) ||
            (s.studentId || '').toLowerCase().includes(q)
        );
    }, [submissions, searchQuery]);

    const degreePending = useMemo(() => {
        const result: Record<string, number> = {};
        for (const deg of degreeLevels) {
            result[deg] = courses.filter(c => (c.degreeLevel || 'bachelor') === deg).length;
        }
        return result;
    }, [courses]);

    return { filteredCourses, filteredSubmissions, degreePending };
}
