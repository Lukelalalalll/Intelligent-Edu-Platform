import client from './client';

export interface IndexedDoc {
    doc_name: string;
    chunk_count: number;
    indexed_at: string;
    chapter_id?: string;
}

export interface IndexCourseSummary {
    course_id: string;
    doc_count: number;
    total_chunks: number;
}

export interface CourseInfo {
    id: string;
    courseId: string;
    name: string;
    semester: string;
}

export const knowledgeBaseApi = {
    /** Fetch the teacher's courses from /profile/courses. */
    getCourses: (): Promise<{ role: string; semester: string; courses: CourseInfo[] }> =>
        client.get('/profile/courses').then(r => r.data),

    /** Get a summary of all indexed courses (doc counts). */
    getSummary: (): Promise<{ courses: IndexCourseSummary[] }> =>
        client.get('/ai/index-course/summary').then(r => r.data),

    /** List all indexed documents for a given course. */
    listDocs: (courseId: string): Promise<{ course_id: string; documents: IndexedDoc[] }> =>
        client.get(`/ai/index-course/${encodeURIComponent(courseId)}`).then(r => r.data),

    /** Upload and index a file into a course's vector store (async job). */
    uploadDoc: (
        courseId: string,
        file: File,
        chapterId?: string,
        onProgress?: (pct: number) => void,
    ): Promise<{ job_id: string; status: string; filename: string; content_hash: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        if (chapterId) formData.append('chapter_id', chapterId);
        return client
            .post(`/ai/index-course/${encodeURIComponent(courseId)}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
                },
            })
            .then(r => r.data);
    },

    /** Poll the status of an async indexing job. */
    getJobStatus: (jobId: string): Promise<{
        job_id: string;
        status: string;
        error?: string;
        result?: { indexed: boolean; chunk_count?: number; reason?: string };
    }> =>
        client.get(`/ai/index-course/job/${encodeURIComponent(jobId)}`).then(r => r.data),

    /** Remove a document from the course vector store. */
    removeDoc: (courseId: string, docName: string): Promise<{ ok: boolean }> =>
        client
            .delete(`/ai/index-course/${encodeURIComponent(courseId)}/${encodeURIComponent(docName)}`)
            .then(r => r.data),

    /** Test retrieval quality — returns top-k chunks for a given query. */
    testRetrieval: (
        courseId: string,
        query: string,
        chapterId: string = '',
        topK: number = 5,
    ): Promise<{
        query: string;
        course_id: string;
        top_k: number;
        latency_ms: number;
        results: { course_id: string; text: string; score: number; doc_name: string; chapter_id?: string }[];
    }> =>
        client
            .post(`/ai/index-course/${encodeURIComponent(courseId)}/test-retrieval`, { query, top_k: topK, chapter_id: chapterId })
            .then(r => r.data),
};
