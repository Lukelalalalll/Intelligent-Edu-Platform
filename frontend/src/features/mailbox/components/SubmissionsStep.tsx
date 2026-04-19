import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Submission } from '../types';
import styles from '../styles/mailbox.module.css';

function getInitials(name: string): string {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

interface SubmissionsStepProps {
    loading: boolean;
    submissions: Submission[];
    searchQuery: string;
    onSearchChange: (q: string) => void;
}

export default function SubmissionsStep({ loading, submissions, searchQuery, onSearchChange }: SubmissionsStepProps) {
    const navigate = useNavigate();
    const listRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: submissions.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => 92,
        overscan: 5,
    });

    return (
        <div className={styles.stepContent}>
            <div className={styles.actionBar}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    <i className="fas fa-users"></i> Submissions
                </h2>
                <div className={styles.searchBox}>
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search student name or UID..."
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <p className={styles.loadingLine} style={{ textAlign: 'center', padding: '2rem' }}>
                    Loading submissions...
                </p>
            ) : (
                <div
                    ref={listRef}
                    className={styles.submissionsList}
                    style={{ height: 'min(60vh, 640px)', overflowY: 'auto', display: 'block' }}
                >
                    {submissions.length === 0 ? (
                        <p className={styles.emptyLine} style={{ textAlign: 'center', padding: '2rem' }}>
                            No submissions found.
                        </p>
                    ) : (
                        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map(virtualItem => {
                                const sub = submissions[virtualItem.index];
                                const isGraded = sub.status === 'graded';
                                const initials = getInitials(sub.studentName);
                                return (
                                    <div
                                        key={sub.id}
                                        className={styles.submissionItem}
                                        style={{
                                            position: 'absolute',
                                            top: virtualItem.start,
                                            width: '100%',
                                            animation: 'none',
                                        }}
                                    >
                                        <div className={styles.subInfo}>
                                            <div
                                                className={styles.subAvatar}
                                                style={isGraded ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' } : undefined}
                                            >
                                                {initials}
                                            </div>
                                            <div>
                                                <h4>{sub.studentName || 'Unknown Student'}</h4>
                                                <p>
                                                    <span><i className="fas fa-id-card"></i> {sub.studentId || '—'}</span>
                                                    {' '}
                                                    <span><i className="far fa-clock"></i> {sub.submittedAt || '—'}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className={styles.subStatus}>
                                            <span className={`${styles.badge} ${isGraded ? styles.badgeSuccess : styles.badgePending}`}>
                                                {isGraded ? 'Graded' : 'Needs Grading'}
                                            </span>
                                        </div>
                                        <div className={styles.subAction}>
                                            {isGraded ? (
                                                <button
                                                    className={styles.btnOutline}
                                                    onClick={() => navigate(`/mailbox/grade_workbench/${sub.id}`)}
                                                >
                                                    <i className="fas fa-eye"></i> Review
                                                </button>
                                            ) : (
                                                <button
                                                    className={styles.btnGrade}
                                                    onClick={() => navigate(`/mailbox/grade_workbench/${sub.id}`)}
                                                >
                                                    <i className="fas fa-pen"></i> Grade Now
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
