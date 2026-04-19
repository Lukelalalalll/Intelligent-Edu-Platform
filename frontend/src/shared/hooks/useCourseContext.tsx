import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import client from '../api/client';
import type { Course } from '@/types/api';

interface CourseContextValue {
    courses: Course[];
    selectedCourse: Course | null;
    selectedCourseId: string | null;
    selectCourse: (courseId: string | null) => void;
    fetchCourses: () => Promise<void>;
    isLoading: boolean;
}

const CourseContext = createContext<CourseContextValue | null>(null);

export function CourseProvider({ children }: { children: ReactNode }) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(() => {
        return localStorage.getItem('selectedCourseId') || null;
    });
    const [isLoading, setIsLoading] = useState(false);

    const fetchCourses = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await client.get('/grading/courses');
            setCourses(res.data?.courses || res.data || []);
        } catch {
            setCourses([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const selectCourse = useCallback((courseId: string | null) => {
        setSelectedCourseId(courseId);
        if (courseId) {
            localStorage.setItem('selectedCourseId', courseId);
        } else {
            localStorage.removeItem('selectedCourseId');
        }
    }, []);

    const selectedCourse = courses.find(
        (c) => c._id === selectedCourseId || c.id === selectedCourseId || c.course_id === selectedCourseId
    ) || null;

    useEffect(() => {
        const user = localStorage.getItem('user');
        if (user) fetchCourses();
    }, [fetchCourses]);

    return (
        <CourseContext.Provider value={{ courses, selectedCourse, selectedCourseId, selectCourse, fetchCourses, isLoading }}>
            {children}
        </CourseContext.Provider>
    );
}

export function useCourseContext(): CourseContextValue {
    const ctx = useContext(CourseContext);
    if (!ctx) throw new Error('useCourseContext must be used within CourseProvider');
    return ctx;
}
