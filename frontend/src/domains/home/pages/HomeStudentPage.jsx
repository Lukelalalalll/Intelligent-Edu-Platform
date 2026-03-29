// frontend/src/pages/HomeStudent.jsx

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import GeminiChat from './home/components/GeminiChat';
import styles from '../styles/HomeStudent.module.css';

export default function HomeStudent({
    username, currentStep, selectedCourse, uploadedFiles,
    handlers: { handleCourseSelect, handleFileUpload, handleBackToCourses }
}) {
    const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'assignments'
    return (
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', paddingBottom: '40px' }}>
            {/* 1. 顶部动态渐变横幅 */}
            <section className={styles.welcomeBanner}>
                <h1>Welcome back, {username}</h1>
                <p>Manage your assignments and chat with your intelligent learning assistant</p>
            </section>

            {/* 2. Tab Switcher: AI Space | My Assignments */}
            <div className={styles.tabSwitcher}>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'ai' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('ai')}
                >
                    <i className="fas fa-robot"></i> AI Space
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'assignments' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('assignments')}
                >
                    <i className="fas fa-tasks"></i> My Assignments
                </button>
            </div>

            {/* 3. 内容区域：根据 tab 切换显示 */}
            {activeTab === 'ai' ? (
                <section className={styles.geminiWrapper}>
                    <GeminiChat aiInteractUrl="/ai-interaction" />
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
                            <div>{selectedCourse}</div>
                        </div>
                        <div className={`${styles.stepItem} ${currentStep === 2 ? styles.stepActive : ''}`}>
                            <div className={styles.stepIcon}>2</div>
                            <div>Submit Work</div>
                        </div>
                    </div>

                    {/* Step 1: 课程选择 */}
                    <div className={`${styles.stepView} ${currentStep === 1 ? styles.stepViewActive : ''}`}>
                        <div className={styles.selectionGrid}>
                            <div className={`${styles.selectionCard} ${styles.courseCard}`} onClick={() => handleCourseSelect('COMP3278 Intro to DB', 'COMP3278')}>
                                <div className={styles.courseCode}>COMP3278</div>
                                <h3>Introduction to Database Management Systems</h3>
                                <span className={`${styles.badge} ${styles.badgePending}`}>1 Due Soon</span>
                            </div>
                            <div className={`${styles.selectionCard} ${styles.courseCard}`} onClick={() => handleCourseSelect('COMP3322 Modern Web', 'COMP3322')}>
                                <div className={styles.courseCode}>COMP3322</div>
                                <h3>Modern Technologies on World Wide Web</h3>
                                <span className={`${styles.badge} ${styles.badgeSuccess}`}>All Caught Up</span>
                            </div>
                            <div className={`${styles.selectionCard} ${styles.courseCard}`} onClick={() => handleCourseSelect('COMP2119 Data Structures', 'COMP2119')}>
                                <div className={styles.courseCode}>COMP2119</div>
                                <h3>Introduction to Data Structures and Algorithms</h3>
                                <span className={`${styles.badge} ${styles.badgePending}`}>2 Pending</span>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: 作业列表与提交 */}
                    <div className={`${styles.stepView} ${currentStep === 2 ? styles.stepViewActive : ''}`}>
                        <button className={styles.btnBack} onClick={handleBackToCourses}>
                            <i className="fas fa-arrow-left"></i> Back to Courses
                        </button>
                        <div className={styles.selectionGrid}>

                            {/* 未交作业 */}
                            <div className={styles.selectionCard}>
                                <div className={styles.hwHeader}>
                                    <h3>Assignment 1</h3>
                                    <span className={`${styles.badge} ${styles.badgePending}`}><i className="far fa-clock"></i> Due in 2 days</span>
                                </div>
                                <p className={styles.hwDesc}>ER Diagram and Relational Algebra</p>

                                {!uploadedFiles['Assignment 1'] ? (
                                    <div className={styles.uploadArea} onClick={() => document.getElementById('file-upload-1').click()}>
                                        <i className="fas fa-cloud-upload-alt"></i>
                                        <span>Click to upload PDF/ZIP</span>
                                        <input type="file" id="file-upload-1" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'Assignment 1')} />
                                    </div>
                                ) : (
                                    <div className={styles.uploadArea} style={{ borderColor: 'var(--primary-color)', background: 'var(--primary-light)' }}>
                                        <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)' }}></i>
                                        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{uploadedFiles['Assignment 1']} selected</span>
                                        <button style={{ marginTop: '15px', width: '100%', border: 'none', padding: '10px', borderRadius: '8px', background: 'var(--primary-color)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                                            Confirm Submission
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 已交作业 */}
                            <div className={styles.selectionCard}>
                                <div className={styles.hwHeader}>
                                    <h3>Midterm Project</h3>
                                    <span className={`${styles.badge} ${styles.badgeSuccess}`}><i className="fas fa-check-double"></i> Graded: 95/100</span>
                                </div>
                                <p className={styles.hwDesc}>Database System Design Implementation</p>
                                <div className={styles.submissionInfo}>
                                    <p><i className="fas fa-file-pdf"></i> final_project_v2.pdf</p>
                                    <p className={styles.time}><i className="far fa-calendar-check"></i> Submitted Oct 10, 14:30</p>
                                </div>
                                <button className={styles.btnOutlineSmall} style={{ marginTop: '15px', width: '100%' }}><i className="fas fa-eye"></i> View Feedback</button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

        </div>
    );
}