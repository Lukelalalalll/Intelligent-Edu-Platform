import type { IndexedDoc } from '../../../../api/knowledgeBaseApi';
import type { DiagnosticChapter, DiagnosticConfig, DiagnosticReport } from '../../../diagnostic-feedback/api/diagnosticApi';

export interface ChapterDraft {
    chapter_name: string;
    chapter_order: number;
    description: string;
    diagnostic_enabled: boolean;
}

export interface UploadTask {
    taskId: string;
    file: File;
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
    chunkCount?: number;
}

export interface DocumentManagerProps {
    courseId: string;
    courseName: string;
    documents: IndexedDoc[];
    loadingDocs: boolean;
    uploadTasks: UploadTask[];
    deletingDoc: string | null;
    onUploadFile: (file: File) => void;
    onDeleteDoc: (docName: string) => void;
    uploading: boolean;
    chapters: DiagnosticChapter[];
    selectedChapterId: string;
    onSelectChapter: (chapterId: string) => void;
    onCreateChapter: (chapterName: string, description?: string) => Promise<void>;
    onUpdateChapter: (
        chapterId: string,
        payload: Partial<Pick<DiagnosticChapter, 'chapter_name' | 'chapter_order' | 'description' | 'diagnostic_enabled'>>,
    ) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
    selectedChapterConfig: DiagnosticConfig | null;
    onSaveChapterConfig: (chapterId: string, payload: { question_count: number; pass_score: number; time_limit_minutes: number }) => void;
    onReassignDocChapter: (docName: string, chapterId: string) => void;
    reports: DiagnosticReport[];
    onSaveReportComment: (reportId: string, comment: string) => void;
}

export type RetrievalResult = {
    course_id: string;
    text: string;
    score: number;
    doc_name: string;
    chapter_id?: string;
};
