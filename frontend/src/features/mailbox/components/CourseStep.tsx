import React from 'react';
import type { Course } from '../types';
import styles from '../styles/mailbox.module.css';

interface CourseStepProps {
    loading: boolean;
    courses: Course[];
    onSelect: (course: Course) => void;
}

export default function CourseStep({ loading, courses, onSelect }: CourseStepProps) {
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.sectionTitle}>
                <i className="fas fa-book-open"></i> Select Course
            </h2>
            {loading ? (
                <p className={styles.loadingLine}>Loading courses...</p>
            ) : (
                <div className={styles.selectionGrid}>
                    {courses.map((course, idx) => (
                        <div
                            key={course.id}
                            className={`${styles.selectionCard} ${styles.courseCard}`}
                            style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
                            onClick={() => onSelect(course)}
                        >
                            <div className={styles.courseCode}>{course.courseCode || course.id}</div>
                            <h3>{course.courseName || course.courseCode}</h3>
                            <p><i className="far fa-calendar-alt"></i> {course.semester || 'No semester'}</p>
                        </div>
                    ))}
                    {courses.length === 0 && (
                        <p className={styles.emptyLine} style={{ gridColumn: '1/-1', textAlign: 'center' }}>
                            No courses found for this degree level.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
