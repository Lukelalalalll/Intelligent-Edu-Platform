import type { IndexedDoc } from '../../../api/knowledgeBaseApi';

export interface ChapterDraft {
    chapter_name: string;
    chapter_order: number;
    description: string;
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
    onDismissUploadTasks: () => void;
    uploading: boolean;
    chapters: any[];
    selectedChapterId: string;
    onSelectChapter: (chapterId: string) => void;
    onCreateChapter: (chapterName: string, description?: string) => Promise<void>;
    onUpdateChapter: (
        chapterId: string,
        payload: Partial<Pick<ChapterDraft, 'chapter_name' | 'chapter_order' | 'description'>>,
    ) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
    onReassignDocChapter: (docName: string, chapterId: string) => void;
}

export type RetrievalResult = {
    course_id: string;
    text: string;
    score: number;
    doc_name: string;
    chapter_id?: string;
};
