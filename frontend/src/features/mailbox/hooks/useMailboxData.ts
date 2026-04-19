import { useEffect, useState, useCallback } from 'react';
import { teacherApi } from '../api/mailboxApi';
import type { Course, Assignment, Submission, DegreeLevel, MailboxSelections } from '../types';

const degreeLabels: Record<DegreeLevel, string> = { bachelor: 'Bachelor', master: 'Master', phd: 'PhD' };

interface MailboxDataOptions {
    currentStep: number;
    selections: MailboxSelections;
    setStep: (step: number) => void;
    setSelection: (key: keyof MailboxSelections, label: string, nextStep: number) => void;
}

export function useMailboxData({ currentStep, selections, setStep, setSelection }: MailboxDataOptions) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(false);

    const loadCourses = useCallback(async () => {
        try {
            setLoading(true);
            const data = await teacherApi.getCoursesV2();
            setCourses(data.courses || []);
        } catch (err) {
            console.error('Failed to load courses', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadAssignments = useCallback(async (courseId: string) => {
        try {
            setLoading(true);
            const data = await teacherApi.getAssignmentsV2(courseId);
            setAssignments(data.assignments || []);
        } catch (err) {
            console.error('Failed to load assignments', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadSubmissions = useCallback(async (assignmentId: string) => {
        try {
            setLoading(true);
            const data = await teacherApi.getSubmissionsV2(assignmentId);
            setSubmissions(data.submissions || []);
        } catch (err) {
            console.error('Failed to load submissions', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadCourses(); }, [loadCourses]);

    useEffect(() => {
        if (currentStep <= 2) { setAssignments([]); setSubmissions([]); }
        if (currentStep <= 3) { setSubmissions([]); }
    }, [currentStep]);

    const handleSelectDegree = (degree: DegreeLevel) => {
        setSelection('degree', degreeLabels[degree] || degree, 2);
    };

    const handleSelectCourse = (course: Course) => {
        setSelection('course', course.courseName || course.courseCode || course.id, 3);
        loadAssignments(course.id);
    };

    const handleSelectAssignment = (assignment: Assignment) => {
        setSelection('assignment', assignment.title || assignment.id, 4);
        loadSubmissions(assignment.id);
    };

    return {
        courses, assignments, submissions, loading,
        handleSelectDegree, handleSelectCourse, handleSelectAssignment,
    };
}
