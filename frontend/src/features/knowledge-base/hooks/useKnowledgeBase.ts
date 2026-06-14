import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
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
    const [useFastExtract, setUseFastExtract] = useState(false);
    const [indexProfile, setIndexProfile] = useState<'auto' | 'quality' | 'fast'>('quality');
    const [parserStrategy, setParserStrategy] = useState<'auto' | 'docling' | 'marker' | 'fast'>('auto');
    const [forceReindex, setForceReindex] = useState(false);

    const onToggleExtractMode = useCallback(() => setUseFastExtract(v => !v), []);
    const onToggleForceReindex = useCallback(() => setForceReindex(v => !v), []);

    // Load courses + summary on mount
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const profileRes = await knowledgeBaseApi.getCourses();
                if (alive) {
                    setCourses(profileRes.courses ?? []);
                }
            } catch {
                if (alive) {
                    setCourses([]);
                }
            }

            try {
                const summaryRes = await knowledgeBaseApi.getSummary();
                if (!alive) return;
                const map: Record<string, IndexCourseSummary> = {};
                for (const s of summaryRes.courses ?? []) map[s.course_id] = s;
                setSummaryMap(map);
            } catch {
                if (alive) {
                    setSummaryMap({});
                }
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
            // Keep existing document list on transient errors
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
                useFastExtract,
                indexProfile,
                parserStrategy,
                forceReindex,
            );

            setUploadTasks(prev => prev.map(t =>
                t.taskId === taskId ? { ...t, progress: 100, status: 'uploading' } : t
            ));

            const pollInterval = 1500;
            const maxPolls = 160;
            let reachedTerminalState = false;
            let lastPhase = 'processing';
            for (let i = 0; i < maxPolls; i++) {
                await new Promise(r => setTimeout(r, pollInterval));
                try {
                    const job = await knowledgeBaseApi.getJobStatus(job_id);
                    lastPhase = job.phase || lastPhase;
                    if (job.status === 'done') {
                        setUploadTasks(prev => prev.map(t =>
                                t.taskId === taskId
                                ? {
                                    ...t,
                                    status: 'done',
                                    progress: 100,
                                    chunkCount: job.result?.chunk_count,
                                    parserUsed: job.parser_used,
                                    qualityReport: job.quality_report,
                                    phaseTimings: job.phase_timings,
                                    indexVersion: job.index_version ?? job.result?.index_version,
                                    artifactRefs: job.artifact_refs,
                                }
                                : t,
                        ));
                        reachedTerminalState = true;
                        break;
                    }
                    if (job.status === 'failed') {
                        setUploadTasks(prev => prev.map(t =>
                                t.taskId === taskId
                                ? {
                                    ...t,
                                    status: 'error',
                                    error: job.error || 'Indexing failed',
                                    parserUsed: job.parser_used,
                                    qualityReport: job.quality_report,
                                    phaseTimings: job.phase_timings,
                                    indexVersion: job.index_version,
                                }
                                : t,
                        ));
                        reachedTerminalState = true;
                        break;
                    }
                    // Update progress + phase from backend
                    if (typeof job.progress === 'number') {
                        setUploadTasks(prev => prev.map(t =>
                                t.taskId === taskId
                                ? {
                                    ...t,
                                    status: 'indexing',
                                    progress: job.progress!,
                                    phase: job.phase,
                                    parserUsed: job.parser_used,
                                    qualityReport: job.quality_report,
                                    phaseTimings: job.phase_timings,
                                    indexVersion: job.index_version,
                                    artifactRefs: job.artifact_refs,
                                }
                                : t,
                        ));
                    }
                } catch { /* continue polling */ }
            }

            if (!reachedTerminalState) {
                setUploadTasks(prev => prev.map(t =>
                    t.taskId === taskId
                        ? {
                            ...t,
                            status: 'error',
                            error: `Indexing is still in ${lastPhase}; refresh the document list later or try Fast parser for this file.`,
                        }
                        : t,
                ));
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
    }, [selectedCourseId, selectedChapterId, loadDocs, refreshSummary, useFastExtract, indexProfile, parserStrategy, forceReindex]);

    const handleDismissUploadTasks = useCallback(() => {
        setUploadTasks(prev => prev.filter(t => t.status === 'uploading' || t.status === 'indexing'));
    }, []);

    const handleDeleteDoc = useCallback(async (docName: string) => {
        if (!selectedCourseId) return;
        setDeletingDoc(docName);
        try {
            await knowledgeBaseApi.removeDoc(selectedCourseId, docName);
            setDocuments(prev => prev.filter(doc => doc.doc_name !== docName));
            await loadDocs(selectedCourseId);
            await refreshSummary();
            toast.success('Document removed');
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            toast.error(e?.response?.data?.detail || e?.message || 'Delete failed');
        } finally {
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
        onDismissUploadTasks: handleDismissUploadTasks,
        onCreateChapter: handleCreateChapter,
        onUpdateChapter: handleUpdateChapter,
        onDeleteChapter: handleDeleteChapter,
        onReassignDocChapter: handleReassignDocChapter,
        uploading: uploadTasks.some(t => t.status === 'uploading' || t.status === 'indexing'),
        useFastExtract,
        onToggleExtractMode,
        indexProfile,
        parserStrategy,
        forceReindex,
        onChangeIndexProfile: setIndexProfile,
        onChangeParserStrategy: setParserStrategy,
        onToggleForceReindex,
    };
}
