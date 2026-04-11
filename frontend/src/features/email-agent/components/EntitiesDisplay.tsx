import React from 'react';
import styles from '../styles/EmailList.module.css';

interface EntitiesDisplayProps {
    emailClassification?: Record<string, any> | null;
}

export default function EntitiesDisplay({ emailClassification }: EntitiesDisplayProps) {
    if (!emailClassification?.entities || emailClassification.raw_response) return null;
    const { courses, assignments, students } = emailClassification.entities;
    const hasCourses = courses?.length > 0;
    const hasAssignments = assignments?.length > 0;
    const hasStudents = students?.length > 0;
    if (!hasCourses && !hasAssignments && !hasStudents) return null;
    return (
        <div className={styles.entitiesRow}>
            {hasCourses    && <span className={styles.entityTag}><strong>Courses:</strong> {courses.join(', ')}</span>}
            {hasAssignments && <span className={styles.entityTag}><strong>Assignments:</strong> {assignments.join(', ')}</span>}
            {hasStudents   && <span className={styles.entityTag}><strong>Students:</strong> {students.join(', ')}</span>}
        </div>
    );
}
