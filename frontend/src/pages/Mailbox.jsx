import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/mailbox.module.css';

export default function Mailbox({ currentStep, selections, setStep, setSelection, user }) {

    const navigate = useNavigate();

    // 每次 currentStep 变化时，触发一个小 state 来重置组件，确保入场动画再次播放
    const [animationKey, setAnimationKey] = useState(Date.now());
    useEffect(() => { setAnimationKey(Date.now()); }, [currentStep]);

    // 辅助函数：渲染顶部的 Stepper
    const renderStepper = () => {
        const steps = [
            { id: 1, label: selections.degree || 'Degree Level' },
            { id: 2, label: selections.course || 'Course' },
            { id: 3, label: selections.assignment || 'Assignment' },
            { id: 4, label: 'Submissions', icon: 'fa-check' }
        ];

        return (
            <div className={styles.stepperWrapper}>
                {steps.map((step) => {
                    const isActive = currentStep === step.id;
                    const isCompleted = currentStep > step.id;

                    return (
                        <div
                            key={step.id}
                            className={`${styles.stepItem} ${isActive ? styles.stepActive : ''} ${isCompleted ? styles.stepCompleted : ''}`}
                            onClick={() => isCompleted && setStep(step.id)}
                        >
                            <div className={styles.stepIcon}>
                                {isCompleted || step.icon ? <i className={`fas ${step.icon || 'fa-check'}`}></i> : step.id}
                            </div>
                            <div className={styles.stepText}>{step.label}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="container">
            {/* Page Header (复用 base 样式) */}
            <div className="page-header" style={{ marginBottom: '30px', padding: '2.5rem 2rem' }}>
                <h1><i className="fas fa-inbox"></i> Grading Mailbox</h1>
                <p className="subtitle">Welcome to the intelligent grading workspace, <strong>{user.username || 'Professor'}</strong>.</p>
            </div>

            <div className={styles.mailboxContainer}>
                {renderStepper()}

                {/* 强制使用 key 重新挂载 DOM，确保 CSS Animation (scaleIn) 每次都能生效 */}
                <div key={animationKey} className={styles.stepView}>

                    {/* Step 1: Degree Level */}
                    {currentStep === 1 && (
                        <div>
                            <h2 className={styles.sectionTitle}><i className="fas fa-graduation-cap"></i> Select Degree Level</h2>
                            <div className={styles.selectionGrid}>
                                <div className={styles.selectionCard} onClick={() => setSelection('degree', 'Bachelor', 2)}>
                                    <div className={styles.cardIconLarge}><i className="fas fa-user-graduate"></i></div>
                                    <h3>Bachelor</h3><p>Undergraduate Programs</p>
                                    <span className={`${styles.badge} ${styles.badgePending}`}>12 Pending Tasks</span>
                                </div>
                                <div className={styles.selectionCard} onClick={() => setSelection('degree', 'Master', 2)}>
                                    <div className={styles.cardIconLarge}><i className="fas fa-user-tie"></i></div>
                                    <h3>Master</h3><p>Taught Postgraduate</p>
                                    <span className={`${styles.badge} ${styles.badgePending}`}>5 Pending Tasks</span>
                                </div>
                                <div className={styles.selectionCard} onClick={() => setSelection('degree', 'PhD', 2)}>
                                    <div className={styles.cardIconLarge}><i className="fas fa-microscope"></i></div>
                                    <h3>PhD</h3><p>Research Postgraduate</p>
                                    <span className={`${styles.badge} ${styles.badgeSuccess}`}><i className="fas fa-check-circle"></i> All Caught Up</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Course */}
                    {currentStep === 2 && (
                        <div>
                            <h2 className={styles.sectionTitle}><i className="fas fa-book-open"></i> Select Course</h2>
                            <div className={styles.selectionGrid}>
                                <div className={`${styles.selectionCard} ${styles.courseCard}`} onClick={() => setSelection('course', 'COMP3278', 3)}>
                                    <div className={styles.courseCode}>COMP3278</div>
                                    <h3>Introduction to Database Management Systems</h3>
                                    <p><i className="far fa-calendar-alt"></i> Semester 1, 2024-2025</p>
                                </div>
                                <div className={`${styles.selectionCard} ${styles.courseCard}`} onClick={() => setSelection('course', 'COMP3322', 3)}>
                                    <div className={styles.courseCode}>COMP3322</div>
                                    <h3>Modern Technologies on World Wide Web</h3>
                                    <p><i className="far fa-calendar-alt"></i> Semester 1, 2024-2025</p>
                                </div>
                                <div className={`${styles.selectionCard} ${styles.courseCard}`} onClick={() => setSelection('course', 'COMP2119', 3)}>
                                    <div className={styles.courseCode}>COMP2119</div>
                                    <h3>Intro to Data Structures and Algorithms</h3>
                                    <p><i className="far fa-calendar-alt"></i> Semester 1, 2024-2025</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Assignment */}
                    {currentStep === 3 && (
                        <div>
                            <h2 className={styles.sectionTitle}><i className="fas fa-tasks"></i> Select Assignment</h2>
                            <div className={styles.selectionGrid}>
                                <div className={`${styles.selectionCard} ${styles.hwCard}`} onClick={() => setSelection('assignment', 'Assignment 1...', 4)}>
                                    <div className={styles.hwHeader}>
                                        <h3>Assignment 1</h3>
                                        <span className={`${styles.badge} ${styles.badgePending}`}><i className="far fa-clock"></i> Due 2 days ago</span>
                                    </div>
                                    <p className={styles.hwDesc}>ER Diagram and Relational Algebra</p>
                                    <div className={styles.progressContainer}>
                                        <div className={styles.progressInfo}><span>Grading Progress</span><span>45 / 120 Graded</span></div>
                                        <div className={styles.progressBar}>
                                            {/* 注意：在 React 中，动态宽度在行内样式写最方便 */}
                                            <div className={styles.progressFill} style={{ width: '37.5%' }}></div>
                                        </div>
                                    </div>
                                </div>

                                <div className={`${styles.selectionCard} ${styles.hwCard}`} onClick={() => setSelection('assignment', 'Midterm Project', 4)}>
                                    <div className={styles.hwHeader}>
                                        <h3>Midterm Project</h3>
                                        <span className={`${styles.badge} ${styles.badgeSuccess}`}><i className="fas fa-check"></i> Completed</span>
                                    </div>
                                    <p className={styles.hwDesc}>Database System Design Implementation</p>
                                    <div className={styles.progressContainer}>
                                        <div className={styles.progressInfo}><span>Grading Progress</span><span>120 / 120 Graded</span></div>
                                        <div className={styles.progressBar}>
                                            <div className={`${styles.progressFill} ${styles.progressFillSuccess}`} style={{ width: '100%' }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Submissions List */}
                    {currentStep === 4 && (
                        <div>
                            <div className={styles.actionBar}>
                                <h2 className={styles.sectionTitle} style={{ margin: 0 }}><i className="fas fa-users"></i> Submissions</h2>
                                <div className={styles.searchBox}>
                                    <i className="fas fa-search"></i>
                                    <input type="text" placeholder="Search student name or UID..." />
                                </div>
                            </div>

                            <div className={styles.submissionsList}>
                                <div className={styles.submissionItem}>
                                    <div className={styles.subInfo}>
                                        <div className={styles.subAvatar}>AW</div>
                                        <div>
                                            <h4>Alice Wong</h4>
                                            <p><span><i className="fas fa-id-card"></i> 3035123456</span> <span><i className="far fa-clock"></i> Oct 12, 14:30</span></p>
                                        </div>
                                    </div>
                                    <div className={styles.subStatus}>
                                        <span className={`${styles.badge} ${styles.badgePending}`}>Needs Grading</span>
                                    </div>
                                    <div className={styles.subAction}>
                                        <button className={styles.btnGrade} onClick={() => navigate('/mailbox/grade_workbench/sub_001')}><i className="fas fa-pen"></i> Grade Now</button>
                                    </div>
                                </div>

                                <div className={styles.submissionItem}>
                                    <div className={styles.subInfo}>
                                        <div className={styles.subAvatar} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>BC</div>
                                        <div>
                                            <h4>Bob Chen</h4>
                                            <p><span><i className="fas fa-id-card"></i> 3035987654</span> <span><i className="far fa-clock"></i> Oct 12, 16:45</span></p>
                                        </div>
                                    </div>
                                    <div className={styles.subStatus}>
                                        <span className={`${styles.badge} ${styles.badgeSuccess}`}>Graded (95/100)</span>
                                    </div>
                                    <div className={styles.subAction}>
                                        <button className={styles.btnOutline} onClick={() => navigate('/mailbox/grade_workbench/sub_002')}><i className="fas fa-eye"></i> Review</button>
                                    </div>
                                </div>

                                <div className={styles.submissionItem}>
                                    <div className={styles.subInfo}>
                                        <div className={styles.subAvatar}>CL</div>
                                        <div>
                                            <h4>Charlie Lin</h4>
                                            <p><span><i className="fas fa-id-card"></i> 3035111222</span> <span><i className="far fa-clock"></i> Oct 12, 23:55</span></p>
                                        </div>
                                    </div>
                                    <div className={styles.subStatus}>
                                        <span className={`${styles.badge} ${styles.badgePending}`}>Needs Grading</span>
                                    </div>
                                    <div className={styles.subAction}>
                                        <button className={styles.btnGrade} onClick={() => navigate('/mailbox/grade_workbench/sub_001')}><i className="fas fa-pen"></i> Grade Now</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}