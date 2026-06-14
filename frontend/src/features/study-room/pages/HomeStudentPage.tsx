// frontend/src/features/study-room/components/HomeStudent.tsx

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { studentApi } from '@/api/mailboxApi';
import { useAuthStore } from '@/shared/store/useAuthStore';
import { useI18n } from '@/shared/i18n';
import styles from '../styles/HomeStudent.module.css';
import WelcomeBanner from '@/shared/components/WelcomeBanner';

const StudyRoom = lazy(() => import('../components/StudyRoom'));
const AIChatBox = lazy(() => import('@/features/home/components/AIChatBox/AIChatBox'));
const AssignmentsTab = lazy(() => import('../components/AssignmentsTab'));

function TabFallback({ label }: { label: string }) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>{label}</div>;
}

export default function HomeStudentPage() {
    const storeUser = useAuthStore((state) => state.user);
    const { t } = useI18n();
    const username = storeUser?.username || t('student.fallbackName');

    const [currentStep, setCurrentStep] = useState(1);
    const [selectedCourse, setSelectedCourse] = useState(t('student.selectCourse'));
    const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
    const [activeTab, setActiveTab] = useState('ai');
    const [bannerState, setBannerState] = useState('visible');
    const [courses, setCourses] = useState<any[]>([]);
    const [assignments, setAssignments] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [submitting, setSubmitting] = useState({});
    const [submitSuccess, setSubmitSuccess] = useState({});
    const [fileObjects, setFileObjects] = useState({});
    const [selectedCourseId, setSelectedCourseId] = useState(null);

    const bannerRef = useRef(null);

    const handleCourseSelect = useCallback((courseName: string, shortCode: string) => {
        setSelectedCourse(shortCode);
        setCurrentStep(2);
    }, []);

    const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>, assignmentName: string) => {
        const file = event.target.files?.[0];
        if (file) {
            setUploadedFiles((prev) => ({ ...prev, [assignmentName]: file.name }));
        }
    }, []);

    const handleBackToCourses = useCallback(() => {
        setCurrentStep(1);
        setSelectedCourse(t('student.selectCourse'));
    }, [t]);

    const handleTabSwitch = useCallback((tab: string) => {
        setActiveTab(tab);
        if (tab === 'study') {
            if (bannerState === 'visible') {
                setBannerState('exiting');
            }
            return;
        }

        if (bannerState === 'hidden' || bannerState === 'exiting') {
            setBannerState('visible');
        }
    }, [bannerState]);

    const handleBannerAnimationEnd = useCallback((event) => {
        if (event.target !== bannerRef.current) {
            return;
        }
        if (bannerState === 'exiting') {
            setBannerState('hidden');
        }
    }, [bannerState]);

    const loadCourses = useCallback(async () => {
        try {
            setLoadingCourses(true);
            const data = await studentApi.getCourses();
            setCourses(data.courses || []);
        } catch (error) {
            console.error('Failed to load courses', error);
        } finally {
            setLoadingCourses(false);
        }
    }, []);

    const loadAssignments = useCallback(async (courseSectionId) => {
        try {
            setLoadingAssignments(true);
            const data = await studentApi.getAssignments(courseSectionId);
            setAssignments(data.assignments || []);
        } catch (error) {
            console.error('Failed to load assignments', error);
        } finally {
            setLoadingAssignments(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'assignments' && courses.length === 0) {
            loadCourses();
        }
    }, [activeTab, courses.length, loadCourses]);

    const handleCourseSelectReal = useCallback((course) => {
        const courseId = course.courseSectionId || course.id || course.courseCode;
        setSelectedCourseId(courseId);
        handleCourseSelect(course.courseName || course.courseCode || course.name || courseId, courseId);
        loadAssignments(courseId);
    }, [handleCourseSelect, loadAssignments]);

    const handleSubmitWork = useCallback(async (assignmentId, fileName) => {
        if (!uploadedFiles[fileName]) return;
        const fileObject = fileObjects[fileName];
        if (!fileObject) {
            alert(t('student.reselectFile'));
            return;
        }

        try {
            setSubmitting((prev) => ({ ...prev, [assignmentId]: true }));
            await studentApi.submitWork(assignmentId, fileObject);
            setSubmitSuccess((prev) => ({ ...prev, [assignmentId]: true }));
            if (selectedCourseId) {
                loadAssignments(selectedCourseId);
            }
        } catch (error) {
            console.error('Submission failed', error);
            alert(t('student.submitFailed', { message: error?.response?.data?.detail || error.message }));
        } finally {
            setSubmitting((prev) => ({ ...prev, [assignmentId]: false }));
        }
    }, [fileObjects, loadAssignments, selectedCourseId, t, uploadedFiles]);

    const handleFileUploadWrapped = useCallback((event, assignmentName) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        handleFileUpload(event, assignmentName);
        setFileObjects((prev) => ({ ...prev, [assignmentName]: file }));
    }, [handleFileUpload]);

    return (
        <div className={`${styles.pageContainer} ${activeTab === 'study' ? styles.pageContainerFull : ''}`}>
            {bannerState !== 'hidden' && (
                <div ref={bannerRef} onAnimationEnd={handleBannerAnimationEnd}>
                    <WelcomeBanner
                        className={`${styles.welcomeBanner} ${bannerState === 'exiting' ? styles.welcomeBannerExiting : ''}`}
                        title={t('student.banner.title', { username })}
                        subtitle={t('student.banner.subtitle')}
                        variant="hero"
                    />
                </div>
            )}

            <div className={`${styles.tabSwitcher} ${bannerState === 'hidden' ? styles.tabSwitcherTop : ''}`}>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'ai' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('ai')}
                >
                    <i className="fas fa-robot"></i> {t('home.tab.ai')}
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'study' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('study')}
                >
                    <i className="fas fa-book-reader"></i> {t('student.tab.study')}
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'assignments' ? styles.tabActive : ''}`}
                    onClick={() => handleTabSwitch('assignments')}
                >
                    <i className="fas fa-tasks"></i> {t('student.tab.assignments')}
                </button>
            </div>

            {activeTab === 'ai' ? (
                <section className={styles.geminiWrapper}>
                    <Suspense fallback={<TabFallback label="Loading AI workspace..." />}>
                        <AIChatBox aiInteractUrl="/ai-interaction" />
                    </Suspense>
                </section>
            ) : activeTab === 'study' ? (
                <section className={`${styles.studySection} study-room-workspace`}>
                    <Suspense fallback={<TabFallback label={t('student.loadingStudyRoom')} />}>
                        <StudyRoom />
                    </Suspense>
                </section>
            ) : (
                <Suspense fallback={<TabFallback label="Loading assignments..." />}>
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
                </Suspense>
            )}
        </div>
    );
}
