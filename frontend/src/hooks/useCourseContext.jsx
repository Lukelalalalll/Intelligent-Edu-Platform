import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import client from '../api/client';

const CourseContext = createContext(null);

export function CourseProvider({ children }) {
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState(() => {
        return localStorage.getItem('selectedCourseId') || null;
    });
    const [isLoading, setIsLoading] = useState(false);

    const fetchCourses = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await client.get('/teacher/courses');
            setCourses(res.data?.courses || res.data || []);
        } catch {
            setCourses([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const selectCourse = useCallback((courseId) => {
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

export function useCourseContext() {
    const ctx = useContext(CourseContext);
    if (!ctx) throw new Error('useCourseContext must be used within CourseProvider');
    return ctx;
}
