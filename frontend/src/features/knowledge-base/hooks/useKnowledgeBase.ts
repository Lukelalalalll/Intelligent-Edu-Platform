import { useState, useEffect, useCallback } from 'react';
import { knowledgeBaseApi } from '../../../api/knowledgeBaseApi';
import type { CourseInfo, IndexCourseSummary, IndexedDoc } from '../../../api/knowledgeBaseApi';
import type { UploadTask } from '../components/DocumentManager';
import { diagnosticTeacherApi, type DiagnosticChapter, type DiagnosticConfig, type DiagnosticReport } from '../../diagnostic-feedback/api/diagnosticApi';

export function useKnowledgeBase() {
    const [courses, setCourses] = useState<CourseInfo[]>([]);
    const [summaryMap, setSummaryMap] = useState<Record<string, IndexCourseSummary>>({});
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<IndexedDoc[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
    const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
    const [chapters, setChapters] = useState<DiagnosticChapter[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string>('');
    const [selectedChapterConfig, setSelectedChapterConfig] = useState<DiagnosticConfig | null>(null);
    const [reports, setReports] = useState<DiagnosticReport[]>([]);

    // Load courses + summary on mount
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [profileRes, summaryRes] = await Promise.all([
                    knowledgeBaseApi.getCourses(),
                    knowledgeBaseApi.getSummary(),
                ]);
                if (!alive) return;
                setCourses(profileRes.courses ?? []);
                const map: Record<string, IndexCourseSummary> = {};
                for (const s of summaryRes.courses ?? []) map[s.course_id] = s;
                setSummaryMap(map);
            } catch {
                // leave empty
            } finally {
                if (alive) setLoadingCourses(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const loadDocs = useCallback(async (courseId: string) => {
        setLoadingDocs(true);
        try {
            const res = await knowledgeBaseApi.listDocs(courseId);
            setDocuments(res.documents ?? []);
        } catch {
            setDocuments([]);
        } finally {
            setLoadingDocs(false);
        }
    }, []);

    const loadDiagnosticData = useCallback(async (courseId: string) => {
        try {
            const [chapterRes, reportRes] = await Promise.all([
                diagnosticTeacherApi.listChapters(courseId),
                diagnosticTeacherApi.listReports(courseId),
            ]);
            setChapters(chapterRes.chapters || []);
            const firstChapter = chapterRes.chapters?.[0]?.chapter_id || '';
            setSelectedChapterId(prev => prev || firstChapter);
            setReports(reportRes.reports || []);
        } catch {
            setChapters([]);
            setReports([]);
            setSelectedChapterId('');
        }
    }, []);

    const loadSelectedChapterConfig = useCallback(async (chapterId: string) => {
        if (!chapterId) { setSelectedChapterConfig(null); return; }
        try {
            const res = await diagnosticTeacherApi.getConfig(chapterId);
            setSelectedChapterConfig(res.config || null);
        } catch {
            setSelectedChapterConfig(null);
        }
    }, []);

    useEffect(() => {
        loadSelectedChapterConfig(selectedChapterId);
    }, [selectedChapterId, loadSelectedChapterConfig]);

    const refreshSummary = useCallback(async () => {
        try {
            const res = await knowledgeBaseApi.getSummary();
            const map: Record<string, IndexCourseSummary> = {};
            for (const s of res.courses ?? []) map[s.course_id] = s;
            setSummaryMap(map);
        } catch { /* ignore */ }
    }, []);

    const handleSelectCourse = useCallback((courseId: string) => {
        setSelectedCourseId(courseId);
        setSelectedChapterId('');
        setUploadTasks([]);
        loadDocs(courseId);
        loadDiagnosticData(courseId);
    }, [loadDocs, loadDiagnosticData]);

    const handleUploadFile = useCallback(async (file: File) => {
        if (!selectedCourseId || !selectedChapterId) return;
        const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const newTask: UploadTask = { taskId, file, progress: 0, status: 'uploading' };

        setUploadTasks(prev => [...prev, newTask]);

        try {
            const { job_id } = await knowledgeBaseApi.uploadDoc(
                selectedCourseId,
                file,
                selectedChapterId || undefined,
                (pct) => {
                    setUploadTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, progress: pct } : t));
                },
            );

            setUploadTasks(prev => prev.map(t =>
                t.taskId === taskId ? { ...t, progress: 100, status: 'uploading' } : t
            ));

            const pollInterval = 1500;
            const maxPolls = 60;
            for (let i = 0; i < maxPolls; i++) {
                await new Promise(r => setTimeout(r, pollInterval));
                try {
                    const job = await knowledgeBaseApi.getJobStatus(job_id);
                    if (job.status === 'done') {
                        setUploadTasks(prev => prev.map(t =>
                            t.taskId === taskId
                                ? { ...t, status: 'done', progress: 100, chunkCount: job.result?.chunk_count }
                                : t,
                        ));
                        break;
                    }
                    if (job.status === 'failed') {
                        setUploadTasks(prev => prev.map(t =>
                            t.taskId === taskId
                                ? { ...t, status: 'error', error: job.error || 'Indexing failed' }
                                : t,
                        ));
                        break;
                    }
                } catch { /* continue polling */ }
            }

            await loadDocs(selectedCourseId);
            await refreshSummary();
            await loadDiagnosticData(selectedCourseId);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            const msg = e?.response?.data?.detail || e?.message || 'Upload failed';
            setUploadTasks(prev =>
                prev.map(t => t.taskId === taskId ? { ...t, status: 'error', error: msg } : t),
            );
        }
    }, [selectedCourseId, selectedChapterId, loadDocs, refreshSummary, loadDiagnosticData]);

    const handleDeleteDoc = useCallback(async (docName: string) => {
        if (!selectedCourseId) return;
        setDeletingDoc(docName);
        try {
            await knowledgeBaseApi.removeDoc(selectedCourseId, docName);
            await loadDocs(selectedCourseId);
            await refreshSummary();
        } catch { /* silent */ } finally {
            setDeletingDoc(null);
        }
    }, [selectedCourseId, loadDocs, refreshSummary]);

    const handleCreateChapter = useCallback(async (chapterName: string, description = '') => {
        if (!selectedCourseId || !chapterName.trim()) return;
        await diagnosticTeacherApi.createChapter(selectedCourseId, {
            chapter_name: chapterName.trim(),
            chapter_order: chapters.length + 1,
            description: description.trim(),
            diagnostic_enabled: true,
        });
        await loadDiagnosticData(selectedCourseId);
    }, [selectedCourseId, chapters.length, loadDiagnosticData]);

    const handleUpdateChapter = useCallback(async (
        chapterId: string,
        payload: Partial<Pick<DiagnosticChapter, 'chapter_name' | 'chapter_order' | 'description' | 'diagnostic_enabled'>>,
    ) => {
        if (!selectedCourseId) return;
        await diagnosticTeacherApi.updateChapter(chapterId, payload);
        await loadDiagnosticData(selectedCourseId);
    }, [selectedCourseId, loadDiagnosticData]);

    const handleDeleteChapter = useCallback(async (chapterId: string) => {
        if (!selectedCourseId) return;
        await diagnosticTeacherApi.deleteChapter(chapterId);
        await loadDiagnosticData(selectedCourseId);
    }, [selectedCourseId, loadDiagnosticData]);

    const handleSaveChapterConfig = useCallback(async (chapterId: string, payload: {
        question_count: number;
        pass_score: number;
        time_limit_minutes: number;
    }) => {
        if (!selectedCourseId) return;
        await diagnosticTeacherApi.updateConfig(chapterId, payload);
        await loadSelectedChapterConfig(chapterId);
    }, [selectedCourseId, loadSelectedChapterConfig]);

    const handleReassignDocChapter = useCallback(async (docName: string, chapterId: string) => {
        if (!selectedCourseId || !chapterId) return;
        await diagnosticTeacherApi.reassignKnowledge({
            course_id: selectedCourseId,
            doc_name: docName,
            chapter_id: chapterId,
        });
        await loadDocs(selectedCourseId);
    }, [selectedCourseId, loadDocs]);

    const handleSaveReportComment = useCallback(async (reportId: string, comment: string) => {
        if (!selectedCourseId) return;
        await diagnosticTeacherApi.commentReport(reportId, comment);
        await loadDiagnosticData(selectedCourseId);
    }, [selectedCourseId, loadDiagnosticData]);

    return {
        courses, summaryMap, selectedCourseId, documents,
        loadingCourses, loadingDocs, uploadTasks, deletingDoc,
        chapters, selectedChapterId, selectedChapterConfig, reports,
        onSelectCourse: handleSelectCourse,
        onSelectChapter: setSelectedChapterId,
        onUploadFile: handleUploadFile,
        onDeleteDoc: handleDeleteDoc,
        onCreateChapter: handleCreateChapter,
        onUpdateChapter: handleUpdateChapter,
        onDeleteChapter: handleDeleteChapter,
        onSaveChapterConfig: handleSaveChapterConfig,
        onReassignDocChapter: handleReassignDocChapter,
        onSaveReportComment: handleSaveReportComment,
        uploading: uploadTasks.some(t => t.status === 'uploading'),
    };
}
