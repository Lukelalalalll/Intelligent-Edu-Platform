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
            <aside>
                <div className={styles['menu-label']}>
                    <i className="fas fa-graduation-cap"></i> My Courses
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ height: '40px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px' }} />)}
                </div>
            </aside>
        );
    }

    return (
        <aside>
            <div className={styles['menu-label']}>
                <i className="fas fa-graduation-cap"></i> My Courses
            </div>
            {courses.length === 0 ? (
                <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem' }}>No courses found.</p>
            ) : (
                <ul className={styles['menu-list']}>
                    {courses.map(c => {
                        const summary = summaryMap[c.courseId];
                        const docCount = summary?.doc_count ?? 0;
                        const isActive = c.courseId === selectedCourseId;
                        return (
                            <li
                                key={c.courseId}
                                className={`${styles['menu-item']} ${isActive ? styles['active'] : ''}`}
                                onClick={() => onSelect(c.courseId)}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 700 }}>{c.courseId}</span>
                                    <span>{c.name}</span>
                                </div>
                                {docCount > 0 && (
                                    <span className={styles['badge']}>{docCount} doc{docCount > 1 ? 's' : ''}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </aside>
    );
}
