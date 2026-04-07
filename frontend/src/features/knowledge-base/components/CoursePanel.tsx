import React from 'react';
import styles from '../styles/KnowledgeBase.module.css';
import type { CourseInfo, IndexCourseSummary } from '../../../api/knowledgeBaseApi';

interface CoursePanelProps {
    courses: CourseInfo[];
    summaryMap: Record<string, IndexCourseSummary>;
    selectedCourseId: string | null;
    onSelect: (courseId: string) => void;
    loading: boolean;
}

export default function CoursePanel({
    courses, summaryMap, selectedCourseId, onSelect, loading,
}: CoursePanelProps) {
    if (loading) {
        return (
            <aside className={styles['course-panel']}>
                <h3 className={styles['panel-title']}>
                    <i className="fas fa-graduation-cap"></i> My Courses
                </h3>
                <div className={styles['skeleton-list']}>
                    {[1, 2, 3].map(i => <div key={i} className={styles['skeleton-item']} />)}
                </div>
            </aside>
        );
    }

    return (
        <aside className={styles['course-panel']}>
            <h3 className={styles['panel-title']}>
                <i className="fas fa-graduation-cap"></i> My Courses
            </h3>
            {courses.length === 0 ? (
                <p className={styles['empty-hint']}>No courses found.</p>
            ) : (
                <ul className={styles['course-list']}>
                    {courses.map(c => {
                        const summary = summaryMap[c.courseId];
                        const docCount = summary?.doc_count ?? 0;
                        const isActive = c.courseId === selectedCourseId;
                        return (
                            <li
                                key={c.courseId}
                                className={`${styles['course-item']} ${isActive ? styles['course-active'] : ''}`}
                                onClick={() => onSelect(c.courseId)}
                            >
                                <div className={styles['course-item-info']}>
                                    <span className={styles['course-code']}>{c.courseId}</span>
                                    <span className={styles['course-name']}>{c.name}</span>
                                </div>
                                {docCount > 0 && (
                                    <span className={styles['doc-badge']}>{docCount} doc{docCount > 1 ? 's' : ''}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </aside>
    );
}
