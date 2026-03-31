// frontend/src/pages/HomeStudent.jsx

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import GeminiChat from './home/components/GeminiChat';
import { studentApi } from '../services/api';
import styles from '../styles/HomeStudent.module.css';

const StudyRoom = lazy(() => import('./HomeStudent/StudyRoom'));

export default function HomeStudent({
    username, currentStep, selectedCourse, uploadedFiles,
    handlers: { handleCourseSelect, handleFileUpload, handleBackToCourses }
}) {
    const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'study' | 'assignments'
    const [bannerState, setBannerState] = useState('visible'); // 'visible' | 'exiting' | 'hidden'
    const bannerRef = useRef(null);
    const [courses, setCourses] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [submitting, setSubmitting] = useState({});
    const [submitSuccess, setSubmitSuccess] = useState({});
    const [fileObjects, setFileObjects] = useState({}); // local File objects keyed by assignment label
    const [selectedCourseId, setSelectedCourseId] = useState(null); // track actual v2 course id

    const handleTabSwitch = useCallback((tab) => {
        setActiveTab(tab);
        if (tab === 'study') {
            // Exit banner
            if (bannerState === 'visible') {
                setBannerState('exiting');
            }
        } else {
            // Enter banner
            if (bannerState === 'hidden' || bannerState === 'exiting') {
                setBannerState('visible');
            }
        }
    }, [bannerState]);

    const handleBannerAnimationEnd = useCallback((e) => {
        // Only react to our own animation, not children's
        if (e.target !== bannerRef.current) return;
        if (bannerState === 'exiting') {
            setBannerState('hidden');
        }
    }, [bannerState]);

    const loadCourses = useCallback(async () => {
        try {
            setLoadingCourses(true);
            const data = await studentApi.getCourses();
            setCourses(data.courses || []);
        } catch (err) {
            console.error('Failed to load courses', err);
        } finally {
            setLoadingCourses(false);
        }
    }, []);

    const loadAssignments = useCallback(async (courseSectionId) => {
        try {
            setLoadingAssignments(true);
            const data = await studentApi.getAssignments(courseSectionId);
            setAssignments(data.assignments || []);
        } catch (err) {
            console.error('Failed to load assignments', err);
        } finally {
            setLoadingAssignments(false);
        }
    }, []);

    // Load courses when switching to assignments tab
    useEffect(() => {
        if (activeTab === 'assignments' && courses.length === 0) {
            loadCourses();
        }
    }, [activeTab, courses.length, loadCourses]);

    const handleCourseSelectReal = (course) => {
        const courseId = course.id || course.courseCode;
        setSelectedCourseId(course.id);
        handleCourseSelect(course.courseName || course.courseCode || courseId, courseId);
        loadAssignments(course.id);
    };

    const handleSubmitWork = async (assignmentId, fileName) => {
        if (!uploadedFiles[fileName]) return;
        const fileObj = fileObjects[fileName];
        if (!fileObj) {
            alert('Please re-select your file to submit.');
            return;
        }
        try {
            setSubmitting(prev => ({ ...prev, [assignmentId]: true }));
            await studentApi.submitWork(assignmentId, fileObj);
            setSubmitSuccess(prev => ({ ...prev, [assignmentId]: true }));
            // Refresh assignments using the tracked course ID
            if (selectedCourseId) {
                loadAssignments(selectedCourseId);
            }
        } catch (err) {
            console.error('Submission failed', err);
            alert('Submission failed: ' + (err?.response?.data?.detail || err.message));
        } finally {
            setSubmitting(prev => ({ ...prev, [assignmentId]: false }));
        }
    };

    const handleFileUploadWrapped = (e, assignmentName) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileUpload(e, assignmentName);
            setFileObjects(prev => ({ ...prev, [assignmentName]: file }));
        }
    };

    return (
        <div className={styles.pageContainer}>
            {/* 1. 顶部动态渐变横幅（带退出/入场动画） */}
            {bannerState !== 'hidden' && (
                <section
                    ref={bannerRef}
                    className={`${styles.welcomeBanner} ${bannerState === 'exiting' ? styles.welcomeBannerExiting : ''}`}
                    onAnimationEnd={handleBannerAnimationEnd}
                >
                    <h1>Welcome back, {username}</h1>
                    <p>Manage your assignments and chat with your intelligent learning assistant</p>
                </section>
            )}

            {/* 2. Tab Switcher: AI Space | Study Room | My Assignments */}
            <div className={`${styles.tabSwitcher} ${bannerState === 'hidden' ? styles.tabSwitcherTop : ''}`}>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'ai' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('ai')}
                >
                    <i className="fas fa-robot"></i> AI Space
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'study' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('study')}
                >
                    <i className="fas fa-book-reader"></i> Study Room
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'assignments' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('assignments')}
                >
                    <i className="fas fa-tasks"></i> My Assignments
                </button>
            </div>

            {/* 3. 内容区域：根据 tab 切换显示 */}
            {activeTab === 'ai' ? (
                <section className={styles.geminiWrapper}>
                    <GeminiChat aiInteractUrl="/ai-interaction" />
                </section>
            ) : activeTab === 'study' ? (
                <section className={`${styles.geminiWrapper} ${bannerState === 'hidden' ? styles.studyFullscreen : ''}`}>
                    <Suspense fallback={<div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Loading Study Room...</div>}>
                        <StudyRoom />
                    </Suspense>
                </section>
            ) : (
                <section className={styles.assignmentSection}>
                    <div className={styles.sectionHeader}>
                        <h2><i className="fas fa-tasks"></i> My Assignments</h2>
                    </div>

                    {/* 步骤指示器 */}
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

                    {/* Step 1: 课程选择 */}
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

                    {/* Step 2: 作业列表与提交 */}
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
            )}

        </div>
    );
}