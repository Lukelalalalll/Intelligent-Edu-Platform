import { useEffect, useState, useCallback } from 'react';
import { teacherApi } from '../../../api/mailboxApi';

const degreeLevels = ['bachelor', 'master', 'phd'];
const degreeLabels: Record<string, string> = { bachelor: 'Bachelor', master: 'Master', phd: 'PhD' };
const degreeIcons: Record<string, string> = { bachelor: 'fa-user-graduate', master: 'fa-user-tie', phd: 'fa-microscope' };
const degreeDescs: Record<string, string> = { bachelor: 'Undergraduate Programs', master: 'Taught Postgraduate', phd: 'Research Postgraduate' };

interface MailboxDataOptions {
    currentStep: number;
    selections: { degree?: string; course?: string; assignment?: string };
    setStep: (step: number) => void;
    setSelection: (type: string, label: string, nextStep: number) => void;
}

export function useMailboxData({ currentStep, selections, setStep, setSelection }: MailboxDataOptions) {
    const [courses, setCourses] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [animationKey, setAnimationKey] = useState(Date.now());

    useEffect(() => { setAnimationKey(Date.now()); }, [currentStep]);

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
        setSearchQuery('');
    }, [currentStep]);

    const handleSelectDegree = (degree: string) => {
        setSelection('degree', degreeLabels[degree] || degree, 2);
    };

    const handleSelectCourse = (course: any) => {
        const courseId = course.id;
        setSelection('course', course.courseName || course.courseCode || courseId, 3);
        loadAssignments(courseId);
    };

    const handleSelectAssignment = (assignment: any) => {
        const assignmentId = assignment.id;
        setSelection('assignment', assignment.title || assignmentId, 4);
        loadSubmissions(assignmentId);
    };

    const getInitials = (name: string) => {
        if (!name) return '??';
        return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    };

    const filteredSubmissions = submissions.filter((s: any) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (s.studentName || '').toLowerCase().includes(q)
            || (s.studentId || '').toLowerCase().includes(q);
    });

    const filteredCourses = courses.filter((c: any) => {
        const selectedDegree = (selections.degree || '').toLowerCase();
        if (!selectedDegree) return true;
        return (c.degreeLevel || 'bachelor').toLowerCase() === selectedDegree;
    });

    const degreePending: Record<string, number> = {};
    for (const deg of degreeLevels) {
        degreePending[deg] = courses.filter((c: any) => (c.degreeLevel || 'bachelor') === deg).length;
    }

    return {
        courses, assignments, submissions, loading, searchQuery, setSearchQuery,
        filteredSubmissions, filteredCourses, degreePending, animationKey,
        degreeLevels, degreeLabels, degreeIcons, degreeDescs,
        handleSelectDegree, handleSelectCourse, handleSelectAssignment, getInitials,
    };
}
