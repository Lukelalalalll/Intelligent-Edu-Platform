import React, { useState } from 'react';
import styles from '../styles/AssignmentsTab.module.css';

interface Course {
    id: string;
    courseName?: string;
    courseCode?: string;
    name?: string;
    assignmentCount?: number;
}

interface Grade {
    totalScore?: number | null;
    rubricScores?: Record<string, number>;
    overallFeedback?: string;
    gradingStatus?: string;
}

interface Assignment {
    id: string;
    title?: string;
    description?: string;
    dueAt?: string;
    dueDate?: string;
    hasSubmitted?: boolean;
    status?: string;
    required_file_types?: string[];
    totalScore?: number | null;
    grade?: Grade | null;
    submission?: { pdfPath?: string; submittedAt?: string };
}

interface AssignmentsTabProps {
    courses: Course[];
    assignments: Assignment[];
    loadingCourses: boolean;
    loadingAssignments: boolean;
    currentStep: number;
    selectedCourse: string;
    uploadedFiles: Record<string, string>;
    submitSuccess: Record<string, boolean>;
    submitting: Record<string, boolean>;
    handleCourseSelectReal: (course: Course) => void;
    handleBackToCourses: () => void;
    handleFileUploadWrapped: (e: React.ChangeEvent<HTMLInputElement>, assignmentName: string) => void;
    handleSubmitWork: (assignmentId: string, fileName: string) => void;
}

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

function FeedbackCard({ grade, pdfPath, onClose }: { grade: Grade; pdfPath?: string; onClose: () => void }) {
    const rubricEntries = Object.entries(grade.rubricScores || {});
    const pdfUrl = pdfPath ? `${apiRoot}/${pdfPath}` : null;

    return (
        <div className={styles.feedbackOverlay} onClick={onClose}>
            <div className={styles.feedbackCard} onClick={e => e.stopPropagation()}>
                <div className={styles.feedbackHeader}>
                    <h3><i className="fas fa-star"></i> Grading Feedback</h3>
                    <button className={styles.feedbackClose} onClick={onClose}><i className="fas fa-times"></i></button>
                </div>

                <div className={styles.feedbackScore}>
                    <span className={styles.feedbackScoreNum}>{grade.totalScore ?? '—'}</span>
                    <span className={styles.feedbackScoreLabel}>Total Score</span>
                </div>

                {rubricEntries.length > 0 && (
                    <div className={styles.feedbackRubric}>
                        <h4>Rubric Breakdown</h4>
                        {rubricEntries.map(([criterion, score]) => (
                            <div key={criterion} className={styles.feedbackRubricRow}>
                                <span className={styles.feedbackRubricCriterion}>{criterion}</span>
                                <span className={styles.feedbackRubricScore}>{score}</span>
                            </div>
                        ))}
                    </div>
                )}

                {grade.overallFeedback && (
                    <div className={styles.feedbackComment}>
                        <h4><i className="fas fa-comment-dots"></i> Teacher's Comment</h4>
                        <p>{grade.overallFeedback}</p>
                    </div>
                )}

                {pdfUrl && (
                    <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.feedbackPdfLink}
                    >
                        <i className="fas fa-file-pdf"></i> View Annotated PDF
                    </a>
                )}
            </div>
        </div>
    );
}

export default function AssignmentsTab({
    courses, assignments, loadingCourses, loadingAssignments,
    currentStep, selectedCourse, uploadedFiles, submitSuccess, submitting,
    handleCourseSelectReal, handleBackToCourses, handleFileUploadWrapped, handleSubmitWork,
}: AssignmentsTabProps) {
    const [feedbackAssignment, setFeedbackAssignment] = useState<Assignment | null>(null);

    return (
        <section className={styles.assignmentSection}>
            {feedbackAssignment && feedbackAssignment.grade && (
                <FeedbackCard
                    grade={feedbackAssignment.grade}
                    pdfPath={feedbackAssignment.submission?.pdfPath}
                    onClose={() => setFeedbackAssignment(null)}
                />
            )}
            <div className={styles.sectionHeader}>
                <h2><i className="fas fa-tasks"></i> My Assignments</h2>
            </div>

            <div className={styles.stepperWrapper}>
                <div
                    className={`${styles.stepItem} ${currentStep === 1 ? styles.stepActive : ''} ${currentStep > 1 ? styles.stepCompleted : ''}`}
                    onClick={() => currentStep > 1 && handleBackToCourses()}
                >
                    <div className={styles.stepIcon}>{currentStep > 1 ? <i className="fas fa-check"></i> : '1'}</div>
                    <div>{selectedCourse || 'Select Course'}</div>
                </div>
                <div className={`${styles.stepItem} ${currentStep === 2 ? styles.stepActive : ''}`}>
                    <div className={styles.stepIcon}>2</div>
                    <div>Submit Work</div>
                </div>
            </div>

            {/* Step 1: Course Selection */}
            <div className={`${styles.stepView} ${currentStep === 1 ? styles.stepViewActive : ''}`}>
                {loadingCourses ? (
                    <p style={{ textAlign: 'center', padding: '2rem' }}>Loading your courses...</p>
                ) : (
                    <div className={styles.selectionGrid}>
                        {courses.map(course => {
                            const label = course.courseName || course.courseCode || course.name || course.id;
                            const code = course.courseCode || course.id;
                            return (
                                <div key={course.id} className={`${styles.selectionCard} ${styles.courseCard}`}
                                    onClick={() => handleCourseSelectReal(course)}>
                                    <div className={styles.courseCode}>{code}</div>
                                    <h3>{label}</h3>
                                    <span className={`${styles.badge} ${styles.badgePending}`}>
                                        {course.assignmentCount || 0} Assignments
                                    </span>
                                </div>
                            );
                        })}
                        {courses.length === 0 && !loadingCourses && (
                            <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>
                                No courses found. You may not be enrolled in any courses yet.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Step 2: Assignment List & Submission */}
            <div className={`${styles.stepView} ${currentStep === 2 ? styles.stepViewActive : ''}`}>
                <button className={styles.btnBack} onClick={handleBackToCourses}>
                    <i className="fas fa-arrow-left"></i> Back to Courses
                </button>

                {loadingAssignments ? (
                    <p style={{ textAlign: 'center', padding: '2rem' }}>Loading assignments...</p>
                ) : (
                    <div className={styles.selectionGrid}>
                        {assignments.map(a => {
                            const isSubmitted = a.hasSubmitted;
                            const isGraded = a.status === 'graded';
                            const assignmentLabel = a.title || 'Assignment';
                            const gradeScore = a.grade?.totalScore ?? a.totalScore;

                            return (
                                <div key={a.id} className={styles.selectionCard}>
                                    <div className={styles.hwHeader}>
                                        <h3>{assignmentLabel}</h3>
                                        <span className={`${styles.badge} ${isGraded ? styles.badgeSuccess : isSubmitted ? styles.badgeSuccess : styles.badgePending}`}>
                                            {isGraded ? (
                                                <><i className="fas fa-check-double"></i> Graded{gradeScore != null ? `: ${gradeScore}` : ''}</>
                                            ) : isSubmitted ? (
                                                <><i className="fas fa-check"></i> Submitted</>
                                            ) : (
                                                <><i className="far fa-clock"></i> Due {a.dueAt || a.dueDate || 'TBD'}</>
                                            )}
                                        </span>
                                    </div>
                                    <p className={styles.hwDesc}>{a.description || 'No description'}</p>

                                    {isSubmitted && a.submission ? (
                                        <div className={styles.submissionInfo}>
                                            <p><i className="fas fa-file-pdf"></i> {a.submission.pdfPath ? a.submission.pdfPath.split('/').pop() : 'Submitted'}</p>
                                            <p className={styles.time}><i className="far fa-calendar-check"></i> Submitted {a.submission.submittedAt || ''}</p>
                                        </div>
                                    ) : submitSuccess[a.id] ? (
                                        <div className={styles.uploadArea} style={{ borderColor: 'var(--primary-color)', background: 'var(--primary-light)' }}>
                                            <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)' }}></i>
                                            <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>Submitted successfully!</span>
                                        </div>
                                    ) : !uploadedFiles[assignmentLabel] ? (
                                        <div className={styles.uploadArea} onClick={() => document.getElementById(`file-upload-${a.id}`)?.click()}>
                                            <i className="fas fa-cloud-upload-alt"></i>
                                            <span>Click to upload {a.required_file_types?.length ? a.required_file_types.join(', ') : 'files'}</span>
                                            <input type="file" id={`file-upload-${a.id}`} style={{ display: 'none' }}
                                                accept={a.required_file_types?.length ? a.required_file_types.join(',') : '.pdf,.zip'}
                                                onChange={(e) => handleFileUploadWrapped(e, assignmentLabel)} />
                                        </div>
                                    ) : (
                                        <div className={styles.uploadArea} style={{ borderColor: 'var(--primary-color)', background: 'var(--primary-light)' }}>
                                            <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)' }}></i>
                                            <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{uploadedFiles[assignmentLabel]} selected</span>
                                            <button
                                                disabled={submitting[a.id]}
                                                className={styles.uploadConfirmBtn}
                                                onClick={() => handleSubmitWork(a.id, assignmentLabel)}
                                                style={{ opacity: submitting[a.id] ? 0.7 : 1, cursor: submitting[a.id] ? 'wait' : 'pointer' }}>
                                                {submitting[a.id] ? 'Submitting...' : 'Confirm Submission'}
                                            </button>
                                        </div>
                                    )}

                                    {isGraded && (
                                        <button
                                            className={`${styles.btnOutlineSmall} ${styles.viewFeedbackBtn}`}
                                            onClick={() => setFeedbackAssignment(a)}
                                        >
                                            <i className="fas fa-comment-dots"></i> View Feedback
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {assignments.length === 0 && !loadingAssignments && (
                            <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>
                                No assignments found for this course.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
