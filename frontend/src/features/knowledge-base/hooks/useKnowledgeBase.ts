import { useState, useEffect, useCallback } from 'react';
import { knowledgeBaseApi } from '../../../api/knowledgeBaseApi';
import type { CourseInfo, IndexCourseSummary, IndexedDoc } from '../../../api/knowledgeBaseApi';
import type { UploadTask } from '../components/DocumentManager';

export function useKnowledgeBase() {
    const [courses, setCourses] = useState<CourseInfo[]>([]);
    const [summaryMap, setSummaryMap] = useState<Record<string, IndexCourseSummary>>({});
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<IndexedDoc[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
    const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
    const [chapters, setChapters] = useState<any[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string>('');

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
    }, [loadDocs]);

    const handleUploadFile = useCallback(async (file: File) => {
        if (!selectedCourseId) return;
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
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            const msg = e?.response?.data?.detail || e?.message || 'Upload failed';
            setUploadTasks(prev =>
                prev.map(t => t.taskId === taskId ? { ...t, status: 'error', error: msg } : t),
            );
        }
    }, [selectedCourseId, selectedChapterId, loadDocs, refreshSummary]);

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

    const handleCreateChapter = useCallback(async (_chapterName: string, _description = '') => {
        // Chapter creation no longer supported (diagnostic feature removed)
    }, []);

    const handleUpdateChapter = useCallback(async (_chapterId: string, _payload: any) => {
        // Chapter update no longer supported (diagnostic feature removed)
    }, []);

    const handleDeleteChapter = useCallback(async (_chapterId: string) => {
        // Chapter deletion no longer supported (diagnostic feature removed)
    }, []);

    const handleReassignDocChapter = useCallback(async (_docName: string, _chapterId: string) => {
        // Chapter reassignment no longer supported (diagnostic feature removed)
    }, []);

    return {
        courses, summaryMap, selectedCourseId, documents,
        loadingCourses, loadingDocs, uploadTasks, deletingDoc,
        chapters, selectedChapterId,
        onSelectCourse: handleSelectCourse,
        onSelectChapter: setSelectedChapterId,
        onUploadFile: handleUploadFile,
        onDeleteDoc: handleDeleteDoc,
        onCreateChapter: handleCreateChapter,
        onUpdateChapter: handleUpdateChapter,
        onDeleteChapter: handleDeleteChapter,
        onReassignDocChapter: handleReassignDocChapter,
        uploading: uploadTasks.some(t => t.status === 'uploading'),
    };
}
