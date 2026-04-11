import React, { useEffect, useMemo, useState } from 'react';
import { diagnosticTeacherApi, type DiagnosticChapter, type DiagnosticFeedback } from './api/diagnosticApi';
import { knowledgeBaseApi, type CourseInfo } from '../../api/knowledgeBaseApi';
import styles from './styles/DiagnosticFeedbackPage.module.css';

export default function DiagnosticFeedbackPage() {
    const [courses, setCourses] = useState<CourseInfo[]>([]);
    const [chapters, setChapters] = useState<DiagnosticChapter[]>([]);
    const [feedbackItems, setFeedbackItems] = useState<DiagnosticFeedback[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [selectedChapterId, setSelectedChapterId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await knowledgeBaseApi.getCourses();
                if (!alive) return;
                const list = res.courses || [];
                setCourses(list);
                if (list.length > 0) {
                    setSelectedCourseId(list[0].courseId || list[0].id || '');
                }
            } catch {
                if (!alive) return;
                setCourses([]);
                setError('Failed to load course list.');
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        let alive = true;
        if (!selectedCourseId) {
            setChapters([]);
            setFeedbackItems([]);
            return;
        }

        (async () => {
            setLoading(true);
            setError('');
            try {
                const [chapterRes, feedbackRes] = await Promise.all([
                    diagnosticTeacherApi.listChapters(selectedCourseId),
                    diagnosticTeacherApi.listFeedback(selectedCourseId),
                ]);
                if (!alive) return;
                const chapterList = chapterRes.chapters || [];
                setChapters(chapterList);
                setFeedbackItems(feedbackRes.feedback || []);

                setSelectedChapterId('');
                setSelectedStudentId('');
            } catch {
                if (!alive) return;
                setChapters([]);
                setFeedbackItems([]);
                setError('Failed to load feedback data for this course.');
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [selectedCourseId]);

    useEffect(() => {
        let alive = true;
        if (!selectedCourseId) return;

        (async () => {
            setLoading(true);
            setError('');
            try {
                const res = await diagnosticTeacherApi.listFeedback(
                    selectedCourseId,
                    selectedChapterId ? { chapter_id: selectedChapterId } : undefined,
                );
                if (!alive) return;
                setFeedbackItems(res.feedback || []);
                setSelectedStudentId('');
            } catch {
                if (!alive) return;
                setFeedbackItems([]);
                setError('Failed to refresh feedback with selected chapter filter.');
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [selectedCourseId, selectedChapterId]);

    const studentOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: Array<{ value: string; label: string }> = [];
        for (const item of feedbackItems) {
            const value = String(item.student_id || '').trim();
            if (!value || seen.has(value)) continue;
            seen.add(value);
            options.push({
                value,
                label: item.student_name?.trim() ? `${item.student_name} (${value})` : value,
            });
        }
        return options.sort((a, b) => a.label.localeCompare(b.label));
    }, [feedbackItems]);

    const filteredFeedback = useMemo(() => {
        if (!selectedStudentId) return feedbackItems;
        return feedbackItems.filter((item) => String(item.student_id || '') === selectedStudentId);
    }, [feedbackItems, selectedStudentId]);

    const chapterNameMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const chapter of chapters) {
            m[chapter.chapter_id] = chapter.chapter_name;
        }
        return m;
    }, [chapters]);

    return (
        <div className={styles.pageWrap}>
            <header className={styles.headerCard}>
                <h1><i className="fas fa-comment-dots"></i> Student Feedback Inbox</h1>
                <p>Receive and review student diagnostic feedback in a dedicated workspace.</p>
            </header>

            <section className={styles.filterCard}>
                <div className={styles.filterGrid}>
                    <div>
                        <label>Course</label>
                        <select
                            value={selectedCourseId}
                            onChange={(e) => setSelectedCourseId(e.target.value)}
                            disabled={courses.length === 0 || loading}
                        >
                            {courses.length === 0 && <option value="">No course</option>}
                            {courses.map((course) => (
                                <option key={course.courseId || course.id} value={course.courseId || course.id}>
                                    {course.name || course.courseId || course.id}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label>Chapter</label>
                        <select
                            value={selectedChapterId}
                            onChange={(e) => setSelectedChapterId(e.target.value)}
                            disabled={!selectedCourseId || loading}
                        >
                            <option value="">All chapters</option>
                            {chapters.map((chapter) => (
                                <option key={chapter.chapter_id} value={chapter.chapter_id}>
                                    #{chapter.chapter_order} {chapter.chapter_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label>Student</label>
                        <select
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                            disabled={loading || studentOptions.length === 0}
                        >
                            <option value="">All students</option>
                            {studentOptions.map((student) => (
                                <option key={student.value} value={student.value}>{student.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <p className={styles.errorText}>{error}</p>}
            </section>

            <section className={styles.listCard}>
                <div className={styles.listHeader}>
                    <h2>Feedback List</h2>
                    <span>{filteredFeedback.length} item(s)</span>
                </div>

                {loading ? (
                    <p className={styles.hintText}>Loading feedback...</p>
                ) : filteredFeedback.length === 0 ? (
                    <p className={styles.hintText}>No feedback found for current filters.</p>
                ) : (
                    <div className={styles.feedbackList}>
                        {filteredFeedback.map((item) => (
                            <article key={item.feedback_id} className={styles.feedbackItem}>
                                <div className={styles.rowTop}>
                                    <strong>{item.student_name || item.student_id || 'Unknown Student'}</strong>
                                    <span className={styles.ratingTag}>Rating: {item.rating}/5</span>
                                </div>

                                <div className={styles.metaLine}>
                                    <span>Chapter: {chapterNameMap[item.chapter_id] || item.chapter_id || '-'}</span>
                                    <span>Score: {item.report_score}% ({item.report_level || '-'})</span>
                                    <span>Time: {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</span>
                                </div>

                                <p className={styles.commentText}>{item.comment || 'No comment text provided.'}</p>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
