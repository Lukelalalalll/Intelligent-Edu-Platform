import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './styles/mailbox.module.css';
import { useMailboxData } from './hooks/useMailboxData';
import { teacherCopilotApi } from '../../api/teacherCopilotApi';
import WelcomeBanner from '../../shared/components/WelcomeBanner';

export default function Mailbox({ currentStep, selections, setStep, setSelection, user }) {
    const navigate = useNavigate();

    const {
        loading, searchQuery, setSearchQuery,
        filteredSubmissions, filteredCourses, degreePending, animationKey,
        courses,
        degreeLevels, degreeLabels, degreeIcons, degreeDescs,
        assignments,
        handleSelectDegree, handleSelectCourse, handleSelectAssignment, getInitials,
    } = useMailboxData({ currentStep, selections, setStep, setSelection });

    const [copilotCourseId, setCopilotCourseId] = useState('all');
    const [copilotBrief, setCopilotBrief] = useState<any>(null);
    const [copilotLoading, setCopilotLoading] = useState(false);
    const [copilotError, setCopilotError] = useState('');
    const [agendaItems, setAgendaItems] = useState<any[]>([]);
    const [agendaCourseName, setAgendaCourseName] = useState('');
    const [agendaLoading, setAgendaLoading] = useState(false);
    const [agendaError, setAgendaError] = useState('');

    const handleLoadAgenda = async (courseSectionId: string) => {
        if (!courseSectionId) {
            setAgendaItems([]);
            setAgendaCourseName('');
            setAgendaError('Select a course to load agenda.');
            return;
        }

        setAgendaLoading(true);
        setAgendaError('');
        try {
            const res = await teacherCopilotApi.getAgenda(courseSectionId);
            setAgendaItems(res.agenda || []);
            setAgendaCourseName(res.course_name || 'Course');
        } catch (err) {
            setAgendaItems([]);
            setAgendaError(err?.response?.data?.detail || err?.message || 'Failed to load agenda.');
        } finally {
            setAgendaLoading(false);
        }
    };

    const handleGenerateBrief = async () => {
        if (copilotLoading) {
            return;
        }

        setCopilotLoading(true);
        setCopilotError('');
        setAgendaError('');
        try {
            const payload = {
                course_section_id: copilotCourseId === 'all' ? null : copilotCourseId,
                include_actions: true,
                horizon_days: 7,
            };
            const res = await teacherCopilotApi.createBrief(payload);
            setCopilotBrief({
                brief_id: res.brief_id,
                summary: res.summary,
                courses: res.courses || [],
                actions: res.actions || [],
            });

            const agendaCourse = copilotCourseId !== 'all'
                ? copilotCourseId
                : (res.courses?.[0]?.course_section_id || '');
            await handleLoadAgenda(agendaCourse);
        } catch (err) {
            setCopilotBrief(null);
            setAgendaItems([]);
            setCopilotError(err?.response?.data?.detail || err?.message || 'Failed to generate copilot brief.');
        } finally {
            setCopilotLoading(false);
        }
    };

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
            {/* Page Header */}
            <WelcomeBanner
                className={styles.mailboxBanner}
                title={<><i className="fas fa-inbox"></i> Grading Mailbox</>}
                subtitle={<>Welcome to the intelligent grading workspace, <strong>{user.username || 'Professor'}</strong>.</>}
            />

            <div className={styles.copilotCard}>
                <div className={styles.copilotTopRow}>
                    <div>
                        <h2 className={styles.copilotTitle}><i className="fas fa-chalkboard-teacher"></i> Teacher Copilot</h2>
                        <p className={styles.copilotSubtitle}>Generate a brief with risk signals and a practical agenda.</p>
                    </div>

                    <div className={styles.copilotActions}>
                        <select
                            className={styles.copilotSelect}
                            value={copilotCourseId}
                            onChange={(e) => setCopilotCourseId(e.target.value)}
                        >
                            <option value="all">Global View (All Courses)</option>
                            {(courses || []).map((course: any) => (
                                <option key={course.id} value={course.id}>
                                    {course.courseName || course.courseCode || course.id}
                                </option>
                            ))}
                        </select>
                        <button
                            className={styles.copilotBtn}
                            onClick={handleGenerateBrief}
                            disabled={copilotLoading}
                        >
                            {copilotLoading ? <><i className="fas fa-spinner fa-spin"></i> Generating...</> : <><i className="fas fa-wand-magic-sparkles"></i> Generate Brief</>}
                        </button>
                    </div>
                </div>

                {copilotError && <div className={styles.copilotError}>{copilotError}</div>}

                {copilotBrief && (
                    <div className={styles.copilotBody}>
                        <div className={styles.copilotMetrics}>
                            <div className={styles.metricCard}>
                                <span>Courses</span>
                                <strong>{copilotBrief.summary?.total_courses || 0}</strong>
                            </div>
                            <div className={styles.metricCard}>
                                <span>Pending</span>
                                <strong>{copilotBrief.summary?.total_pending_submissions || 0}</strong>
                            </div>
                            <div className={styles.metricCard}>
                                <span>Graded</span>
                                <strong>{copilotBrief.summary?.total_graded_submissions || 0}</strong>
                            </div>
                        </div>

                        <div className={styles.copilotGrid}>
                            <section className={styles.copilotPanel}>
                                <h3>Course Risks</h3>
                                <ul className={styles.riskList}>
                                    {(copilotBrief.courses || []).map((course: any) => (
                                        <li key={course.course_section_id} className={styles.riskItem}>
                                            <div>
                                                <strong>{course.course_name}</strong>
                                                <p>Pending: {course.pending_submissions} | Graded: {course.graded_submissions}</p>
                                            </div>
                                            <span className={`${styles.riskBadge} ${styles[`risk${(course.risk_level || 'low').charAt(0).toUpperCase() + (course.risk_level || 'low').slice(1)}`]}`}>
                                                {course.risk_level}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className={styles.copilotPanel}>
                                <h3>Recommended Actions</h3>
                                <ul className={styles.actionList}>
                                    {(copilotBrief.actions || []).map((action: string, idx: number) => (
                                        <li key={`${idx}-${action}`}>{action}</li>
                                    ))}
                                </ul>
                            </section>
                        </div>

                        <section className={styles.copilotPanel}>
                            <h3>Agenda Checklist {agendaCourseName ? `- ${agendaCourseName}` : ''}</h3>
                            {agendaError && <div className={styles.copilotError}>{agendaError}</div>}
                            {agendaLoading ? (
                                <p className={styles.loadingLine}>Loading agenda...</p>
                            ) : (
                                <ul className={styles.checklist}>
                                    {agendaItems.map((item: any) => (
                                        <li key={`${item.assignment_id}-${item.rank}`}>
                                            <label>
                                                <input type="checkbox" />
                                                <span>
                                                    <strong>{item.title}</strong>
                                                    <em>{item.action}</em>
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                    {agendaItems.length === 0 && <li className={styles.emptyLine}>No agenda items available.</li>}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </div>

            <div className={styles.mailboxContainer}>
                {renderStepper()}

                <div key={animationKey} className={styles.stepView}>

                    {/* Step 1: Degree Level */}
                    {currentStep === 1 && (
                        <div>
                            <h2 className={styles.sectionTitle}><i className="fas fa-graduation-cap"></i> Select Degree Level</h2>
                            <div className={styles.selectionGrid}>
                                {degreeLevels.map(deg => (
                                    <div key={deg} className={styles.selectionCard} onClick={() => handleSelectDegree(deg)}>
                                        <div className={styles.cardIconLarge}><i className={`fas ${degreeIcons[deg]}`}></i></div>
                                        <h3>{degreeLabels[deg]}</h3><p>{degreeDescs[deg]}</p>
                                        <span className={`${styles.badge} ${degreePending[deg] > 0 ? styles.badgePending : styles.badgeSuccess}`}>
                                            {degreePending[deg] > 0 ? `${degreePending[deg]} Courses` : <><i className="fas fa-check-circle"></i> All Caught Up</>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Course */}
                    {currentStep === 2 && (
                        <div>
                            <h2 className={styles.sectionTitle}><i className="fas fa-book-open"></i> Select Course</h2>
                            {loading ? (
                                <p style={{ textAlign: 'center', padding: '2rem' }}>Loading courses...</p>
                            ) : (
                                <div className={styles.selectionGrid}>
                                    {filteredCourses.map(course => {
                                        const cid = course.courseCode || course.id;
                                        return (
                                            <div key={course.id} className={`${styles.selectionCard} ${styles.courseCard}`}
                                                onClick={() => handleSelectCourse(course)}>
                                                <div className={styles.courseCode}>{cid}</div>
                                                <h3>{course.courseName || cid}</h3>
                                                <p><i className="far fa-calendar-alt"></i> {course.semester || 'No semester'}</p>
                                            </div>
                                        );
                                    })}
                                    {filteredCourses.length === 0 && (
                                        <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>No courses found for this degree level.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Assignment */}
                    {currentStep === 3 && (
                        <div>
                            <h2 className={styles.sectionTitle}><i className="fas fa-tasks"></i> Select Assignment</h2>
                            {loading ? (
                                <p style={{ textAlign: 'center', padding: '2rem' }}>Loading assignments...</p>
                            ) : (
                                <div className={styles.selectionGrid}>
                                    {assignments.map(a => {
                                        // Fix 4: use scalar fields from v2 API instead of embedded array
                                        const total = a.submissionCount || 0;
                                        const graded = a.gradedCount || 0;
                                        const pct = total > 0 ? Math.round((graded / total) * 100) : 0;
                                        const allDone = total > 0 && graded === total;

                                        return (
                                            <div key={a.id} className={`${styles.selectionCard} ${styles.hwCard}`}
                                                onClick={() => handleSelectAssignment(a)}>
                                                <div className={styles.hwHeader}>
                                                    <h3>{a.title}</h3>
                                                    <span className={`${styles.badge} ${allDone ? styles.badgeSuccess : styles.badgePending}`}>
                                                        {allDone ? <><i className="fas fa-check"></i> Completed</> : <><i className="far fa-clock"></i> Due {a.dueDate || a.dueAt || 'TBD'}</>}
                                                    </span>
                                                </div>
                                                <p className={styles.hwDesc}>{a.description || 'No description'}</p>
                                                <div className={styles.progressContainer}>
                                                    <div className={styles.progressInfo}><span>Grading Progress</span><span>{graded} / {total} Graded</span></div>
                                                    <div className={styles.progressBar}>
                                                        <div className={`${styles.progressFill} ${allDone ? styles.progressFillSuccess : ''}`} style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {assignments.length === 0 && (
                                        <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>No assignments found for this course.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 4: Submissions List */}
                    {currentStep === 4 && (
                        <div>
                            <div className={styles.actionBar}>
                                <h2 className={styles.sectionTitle} style={{ margin: 0 }}><i className="fas fa-users"></i> Submissions</h2>
                                <div className={styles.searchBox}>
                                    <i className="fas fa-search"></i>
                                    <input type="text" placeholder="Search student name or UID..."
                                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                </div>
                            </div>

                            {loading ? (
                                <p style={{ textAlign: 'center', padding: '2rem' }}>Loading submissions...</p>
                            ) : (
                                <div className={styles.submissionsList}>
                                    {filteredSubmissions.map(sub => {
                                        const isGraded = sub.status === 'graded';
                                        const initials = getInitials(sub.studentName);
                                        return (
                                            <div key={sub.id} className={styles.submissionItem}>
                                                <div className={styles.subInfo}>
                                                    <div className={styles.subAvatar}
                                                        style={isGraded ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' } : undefined}>
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
                                                        <button className={styles.btnOutline}
                                                            onClick={() => navigate(`/mailbox/grade_workbench/${sub.id}`)}>
                                                            <i className="fas fa-eye"></i> Review
                                                        </button>
                                                    ) : (
                                                        <button className={styles.btnGrade}
                                                            onClick={() => navigate(`/mailbox/grade_workbench/${sub.id}`)}>
                                                            <i className="fas fa-pen"></i> Grade Now
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {filteredSubmissions.length === 0 && (
                                        <p style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No submissions found.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}