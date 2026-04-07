import React from 'react';
import styles from '../styles/HomeStudent.module.css';

interface Course {
    id: string;
    courseName?: string;
    courseCode?: string;
    name?: string;
    assignmentCount?: number;
}

interface Assignment {
    id: string;
    title?: string;
    description?: string;
    dueAt?: string;
    dueDate?: string;
    hasSubmitted?: boolean;
    status?: string;
    totalScore?: number;
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

export default function AssignmentsTab({
    courses, assignments, loadingCourses, loadingAssignments,
    currentStep, selectedCourse, uploadedFiles, submitSuccess, submitting,
    handleCourseSelectReal, handleBackToCourses, handleFileUploadWrapped, handleSubmitWork,
}: AssignmentsTabProps) {
    return (
        <section className={styles.assignmentSection}>
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

                            return (
                                <div key={a.id} className={styles.selectionCard}>
                                    <div className={styles.hwHeader}>
                                        <h3>{assignmentLabel}</h3>
                                        <span className={`${styles.badge} ${isGraded ? styles.badgeSuccess : isSubmitted ? styles.badgeSuccess : styles.badgePending}`}>
                                            {isGraded ? (
                                                <><i className="fas fa-check-double"></i> Graded{a.totalScore != null ? `: ${a.totalScore}` : ''}</>
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
                                        <div className={styles.uploadArea} onClick={() => document.getElementById(`file-upload-${a.id}`).click()}>
                                            <i className="fas fa-cloud-upload-alt"></i>
                                            <span>Click to upload PDF/ZIP</span>
                                            <input type="file" id={`file-upload-${a.id}`} style={{ display: 'none' }}
                                                accept=".pdf,.zip"
                                                onChange={(e) => handleFileUploadWrapped(e, assignmentLabel)} />
                                        </div>
                                    ) : (
                                        <div className={styles.uploadArea} style={{ borderColor: 'var(--primary-color)', background: 'var(--primary-light)' }}>
                                            <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)' }}></i>
                                            <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{uploadedFiles[assignmentLabel]} selected</span>
                                            <button
                                                disabled={submitting[a.id]}
                                                onClick={() => handleSubmitWork(a.id, assignmentLabel)}
                                                style={{ marginTop: '15px', width: '100%', border: 'none', padding: '10px', borderRadius: '8px', background: 'var(--primary-color)', color: 'white', cursor: submitting[a.id] ? 'wait' : 'pointer', fontWeight: 'bold', opacity: submitting[a.id] ? 0.7 : 1 }}>
                                                {submitting[a.id] ? 'Submitting...' : 'Confirm Submission'}
                                            </button>
                                        </div>
                                    )}

                                    {isGraded && (
                                        <button className={styles.btnOutlineSmall} style={{ marginTop: '15px', width: '100%' }}>
                                            <i className="fas fa-eye"></i> View Feedback
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
