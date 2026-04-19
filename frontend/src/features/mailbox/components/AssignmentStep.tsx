import React from 'react';
import type { Assignment } from '../types';
import styles from '../styles/mailbox.module.css';

interface AssignmentStepProps {
    loading: boolean;
    assignments: Assignment[];
    onSelect: (assignment: Assignment) => void;
}

export default function AssignmentStep({ loading, assignments, onSelect }: AssignmentStepProps) {
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.sectionTitle}>
                <i className="fas fa-tasks"></i> Select Assignment
            </h2>
            {loading ? (
                <p className={styles.loadingLine}>Loading assignments...</p>
            ) : (
                <div className={styles.selectionGrid}>
                    {assignments.map((a, idx) => {
                        const total = a.submissionCount ?? 0;
                        const graded = a.gradedCount ?? 0;
                        const pct = total > 0 ? Math.round((graded / total) * 100) : 0;
                        const allDone = total > 0 && graded === total;

                        return (
                            <div
                                key={a.id}
                                className={`${styles.selectionCard} ${styles.hwCard}`}
                                style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
                                onClick={() => onSelect(a)}
                            >
                                <div className={styles.hwHeader}>
                                    <h3>{a.title}</h3>
                                    <span className={`${styles.badge} ${allDone ? styles.badgeSuccess : styles.badgePending}`}>
                                        {allDone
                                            ? <><i className="fas fa-check"></i> Completed</>
                                            : <><i className="far fa-clock"></i> Due {a.dueDate || a.dueAt || 'TBD'}</>}
                                    </span>
                                </div>
                                <p className={styles.hwDesc}>{a.description || 'No description'}</p>
                                <div className={styles.progressContainer}>
                                    <div className={styles.progressInfo}>
                                        <span>Grading Progress</span>
                                        <span>{graded} / {total} Graded</span>
                                    </div>
                                    <div className={styles.progressBar}>
                                        <div
                                            className={`${styles.progressFill} ${allDone ? styles.progressFillSuccess : ''}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {assignments.length === 0 && (
                        <p className={styles.emptyLine} style={{ gridColumn: '1/-1', textAlign: 'center' }}>
                            No assignments found for this course.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
