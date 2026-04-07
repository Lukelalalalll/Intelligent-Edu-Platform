import React, { useState, useEffect, useCallback } from 'react';
import KnowledgeBasePage from '../features/knowledge-base/index';
import { knowledgeBaseApi } from '../api/knowledgeBaseApi';
import type { CourseInfo, IndexCourseSummary, IndexedDoc } from '../api/knowledgeBaseApi';
import type { UploadTask } from '../features/knowledge-base/components/DocumentManager';

export default function KnowledgeBaseEntry() {
    const [courses, setCourses] = useState<CourseInfo[]>([]);
    const [summaryMap, setSummaryMap] = useState<Record<string, IndexCourseSummary>>({});
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<IndexedDoc[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
    const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

    // ── Load courses + summary on mount ──
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
                // leave empty — user will see "No courses"
            } finally {
                if (alive) setLoadingCourses(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    // ── Load documents when course changes ──
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

    const handleSelectCourse = useCallback((courseId: string) => {
        setSelectedCourseId(courseId);
        setUploadTasks([]);
        loadDocs(courseId);
    }, [loadDocs]);

    // ── Refresh summary map (after upload/delete) ──
    const refreshSummary = useCallback(async () => {
        try {
            const res = await knowledgeBaseApi.getSummary();
            const map: Record<string, IndexCourseSummary> = {};
            for (const s of res.courses ?? []) map[s.course_id] = s;
            setSummaryMap(map);
        } catch { /* ignore */ }
    }, []);

    // ── Upload a single file (uses taskId to avoid index-based race conditions) ──
    const handleUploadFile = useCallback(async (file: File) => {
        if (!selectedCourseId) return;
        const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const newTask: UploadTask = { taskId, file, progress: 0, status: 'uploading' };

        setUploadTasks(prev => [...prev, newTask]);

        try {
            const { job_id } = await knowledgeBaseApi.uploadDoc(
                selectedCourseId,
                file,
                (pct) => {
                    setUploadTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, progress: pct } : t));
                },
            );

            // Mark upload complete, now polling for indexing
            setUploadTasks(prev => prev.map(t =>
                t.taskId === taskId ? { ...t, progress: 100, status: 'uploading' } : t
            ));

            // Poll job status until done/failed
            const pollInterval = 1500;
            const maxPolls = 60; // ~90s max
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
                    // Still processing — continue polling
                } catch {
                    // Poll error — continue trying
                }
            }

            // Reload document list + summary
            await loadDocs(selectedCourseId);
            await refreshSummary();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Upload failed';
            setUploadTasks(prev =>
                prev.map(t =>
                    t.taskId === taskId ? { ...t, status: 'error', error: msg } : t,
                ),
            );
        }
    }, [selectedCourseId, loadDocs, refreshSummary]);

    // ── Delete a document ──
    const handleDeleteDoc = useCallback(async (docName: string) => {
        if (!selectedCourseId) return;
        setDeletingDoc(docName);
        try {
            await knowledgeBaseApi.removeDoc(selectedCourseId, docName);
            await loadDocs(selectedCourseId);
            await refreshSummary();
        } catch {
            // silent
        } finally {
            setDeletingDoc(null);
        }
    }, [selectedCourseId, loadDocs, refreshSummary]);

    return (
        <KnowledgeBasePage
            courses={courses}
            summaryMap={summaryMap}
            selectedCourseId={selectedCourseId}
            onSelectCourse={handleSelectCourse}
            documents={documents}
            loadingCourses={loadingCourses}
            loadingDocs={loadingDocs}
            uploadTasks={uploadTasks}
            deletingDoc={deletingDoc}
            onUploadFile={handleUploadFile}
            onDeleteDoc={handleDeleteDoc}
            uploading={uploadTasks.some(t => t.status === 'uploading')}
        />
    );
}
