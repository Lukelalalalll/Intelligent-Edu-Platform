import React, { useEffect, useMemo, useState } from 'react';
import { diagnosticStudentApi, type DiagnosticQuestion, type DiagnosticReport } from '../../../api/diagnosticApi';
import { studentApi } from '../../../api/api';
import styles from '../styles/HomeStudent.module.css';

type CourseLite = {
    id?: string;
    courseCode?: string;
    courseName?: string;
};

export default function DiagnosticTab() {
    const [courses, setCourses] = useState<CourseLite[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [chapters, setChapters] = useState<any[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState('');
    const [loading, setLoading] = useState(false);

    const [sessionId, setSessionId] = useState('');
    const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [report, setReport] = useState<DiagnosticReport | null>(null);
    const [feedbackRating, setFeedbackRating] = useState(5);
    const [feedbackComment, setFeedbackComment] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const data = await studentApi.getCourses();
                const list = (data?.courses || []) as CourseLite[];
                setCourses(list);
                if (list.length > 0) {
                    const cid = String(list[0].id || list[0].courseCode || '');
                    setSelectedCourseId(cid);
                }
            } catch {
                setCourses([]);
            }
        })();
    }, []);

    useEffect(() => {
        if (!selectedCourseId) {
            setChapters([]);
            return;
        }
        (async () => {
            try {
                const data = await diagnosticStudentApi.listChapters(selectedCourseId);
                setChapters(data.chapters || []);
                setSelectedChapterId(data.chapters?.[0]?.chapter_id || '');
            } catch {
                setChapters([]);
                setSelectedChapterId('');
            }
        })();
    }, [selectedCourseId]);

    const selectedCourseName = useMemo(() => {
        const match = courses.find(c => String(c.id || c.courseCode || '') === selectedCourseId);
        return match?.courseName || match?.courseCode || selectedCourseId;
    }, [courses, selectedCourseId]);

    const startSession = async () => {
        if (!selectedCourseId || !selectedChapterId) return;
        setLoading(true);
        setReport(null);
        try {
            const res = await diagnosticStudentApi.startSession({
                course_id: selectedCourseId,
                chapter_id: selectedChapterId,
            });
            setSessionId(res.session_id);
            setQuestions(res.questions || []);
            setAnswers({});
        } finally {
            setLoading(false);
        }
    };

    const submitSession = async () => {
        if (!sessionId || questions.length === 0) return;
        setSubmitting(true);
        try {
            const payload = questions.map(q => ({
                question_id: q.question_id,
                answer: answers[q.question_id] || '',
            }));
            const res = await diagnosticStudentApi.submitSession(sessionId, payload);
            setReport(res.report);
            setQuestions([]);
            setSessionId('');
        } finally {
            setSubmitting(false);
        }
    };

    const sendFeedback = async () => {
        if (!report?.report_id) return;
        await diagnosticStudentApi.sendFeedback(report.report_id, {
            rating: feedbackRating,
            comment: feedbackComment,
        });
        setFeedbackComment('');
    };

    return (
        <section className={styles.diagnosticSection}>
            <div className={styles.diagnosticHeader}>
                <h2>Chapter Diagnostic</h2>
                <p>Run a focused chapter-level diagnosis and receive actionable study feedback.</p>
            </div>

            <div className={styles.diagnosticCard}>
                <div className={styles.diagnosticControls}>
                    <select
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                    >
                        {courses.map(c => {
                            const value = String(c.id || c.courseCode || '');
                            return <option key={value} value={value}>{c.courseName || c.courseCode || value}</option>;
                        })}
                    </select>
                    <select
                        value={selectedChapterId}
                        onChange={(e) => setSelectedChapterId(e.target.value)}
                        disabled={chapters.length === 0}
                    >
                        {chapters.length === 0 && <option value="">No chapter configured</option>}
                        {chapters.map(ch => (
                            <option key={ch.chapter_id} value={ch.chapter_id}>
                                {`#${ch.chapter_order} ${ch.chapter_name}`}
                            </option>
                        ))}
                    </select>
                    <button onClick={startSession} disabled={!selectedChapterId || loading}>
                        {loading ? 'Preparing...' : 'Start Diagnostic'}
                    </button>
                </div>

                {questions.length > 0 && (
                    <div className={styles.questionList}>
                        {questions.map((q, idx) => (
                            <div key={q.question_id} className={styles.questionItem}>
                                <h4>{`${idx + 1}. ${q.prompt}`}</h4>
                                <textarea
                                    value={answers[q.question_id] || ''}
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                                    rows={4}
                                    placeholder="Type your answer..."
                                />
                            </div>
                        ))}
                        <button className={styles.submitBtn} onClick={submitSession} disabled={submitting}>
                            {submitting ? 'Scoring...' : 'Submit Diagnostic'}
                        </button>
                    </div>
                )}

                {report && (
                    <div className={styles.reportCard}>
                        <h3>{selectedCourseName} Diagnostic Report</h3>
                        <p><strong>Overall Score:</strong> {report.overall_score}% ({report.level})</p>
                        <p><strong>Strengths:</strong> {(report.strengths || []).join(' | ') || 'N/A'}</p>
                        <p><strong>Weaknesses:</strong> {(report.weaknesses || []).join(' | ') || 'N/A'}</p>
                        <p><strong>Recommendations:</strong> {(report.recommendations || []).join(' | ')}</p>
                        {report.teacher_comment && (
                            <p><strong>Teacher Comment:</strong> {report.teacher_comment}</p>
                        )}

                        <div className={styles.feedbackBox}>
                            <h4>Feedback on This Report</h4>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <label>Rating</label>
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    value={feedbackRating}
                                    onChange={e => setFeedbackRating(Number(e.target.value))}
                                />
                                <span>{feedbackRating}/5</span>
                            </div>
                            <textarea
                                rows={3}
                                placeholder="Tell us if this report helped your revision."
                                value={feedbackComment}
                                onChange={e => setFeedbackComment(e.target.value)}
                            />
                            <button onClick={sendFeedback}>Send Feedback</button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
