// frontend/src/pages/HomeStudent.jsx

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import AIChatBox from '../home/components/AIChatBox';
import { studentApi } from '../../api/api';
import styles from './styles/HomeStudent.module.css';
import AssignmentsTab from './components/AssignmentsTab';
import DiagnosticTab from './components/DiagnosticTab';
import WelcomeBanner from '../../shared/components/WelcomeBanner';

const StudyRoom = lazy(() => import('./StudyRoom'));

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
        const courseId = course.courseSectionId || course.id || course.courseCode;
        setSelectedCourseId(courseId);
        handleCourseSelect(course.courseName || course.courseCode || course.name || courseId, courseId);
        loadAssignments(courseId);
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
        <div className={`${styles.pageContainer} ${activeTab === 'study' ? styles.pageContainerFull : ''}`}>
            {/* 1. 顶部动态渐变横幅（带退出/入场动画） */}
            {bannerState !== 'hidden' && (
                <div ref={bannerRef} onAnimationEnd={handleBannerAnimationEnd}>
                    <WelcomeBanner
                        className={`${styles.welcomeBanner} ${bannerState === 'exiting' ? styles.welcomeBannerExiting : ''}`}
                        title={`Welcome back, ${username}`}
                        subtitle="Manage your assignments and chat with your intelligent learning assistant"
                    />
                </div>
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
                <button
                    className={`${styles.tabBtn} ${activeTab === 'diagnostic' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('diagnostic')}
                >
                    <i className="fas fa-stethoscope"></i> Learning Diagnostic
                </button>
            </div>

            {/* 3. 内容区域：根据 tab 切换显示 */}
            {activeTab === 'ai' ? (
                <section className={styles.geminiWrapper}>
                    <AIChatBox aiInteractUrl="/ai-interaction" />
                </section>
            ) : activeTab === 'study' ? (
                <section className={styles.studySection}>
                    <Suspense fallback={<div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Loading Study Room...</div>}>
                        <StudyRoom />
                    </Suspense>
                </section>
            ) : activeTab === 'assignments' ? (
                <AssignmentsTab
                    courses={courses}
                    assignments={assignments}
                    loadingCourses={loadingCourses}
                    loadingAssignments={loadingAssignments}
                    currentStep={currentStep}
                    selectedCourse={selectedCourse}
                    uploadedFiles={uploadedFiles}
                    submitSuccess={submitSuccess}
                    submitting={submitting}
                    handleCourseSelectReal={handleCourseSelectReal}
                    handleBackToCourses={handleBackToCourses}
                    handleFileUploadWrapped={handleFileUploadWrapped}
                    handleSubmitWork={handleSubmitWork}
                />
            ) : (
                <DiagnosticTab />
            )}

        </div>
    );
}