import React from 'react';
import styles from '../styles/KnowledgeBase.module.css';
import CoursePanel from './CoursePanel';
import DocumentManager from './DocumentManager';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import type { CourseInfo, IndexCourseSummary, IndexedDoc } from '../../../api/knowledgeBaseApi';
import type { UploadTask } from './DocumentManager';

interface KnowledgeBaseViewProps {
    courses: CourseInfo[];
    summaryMap: Record<string, IndexCourseSummary>;
    selectedCourseId: string | null;
    onSelectCourse: (courseId: string) => void;
    documents: IndexedDoc[];
    loadingCourses: boolean;
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
    onUpdateChapter: (chapterId: string, payload: any) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
    onReassignDocChapter: (docName: string, chapterId: string) => void;
    useFastExtract: boolean;
    onToggleExtractMode: () => void;
}

export default function KnowledgeBaseView({
    courses, summaryMap, selectedCourseId, onSelectCourse,
    documents, loadingCourses, loadingDocs,
    uploadTasks, deletingDoc, onUploadFile, onDeleteDoc, onDismissUploadTasks, uploading,
    chapters, selectedChapterId, onSelectChapter, onCreateChapter,
    onUpdateChapter, onDeleteChapter, onReassignDocChapter,
    useFastExtract, onToggleExtractMode,
}: KnowledgeBaseViewProps) {
    const selectedCourse = courses.find(c => c.courseId === selectedCourseId);

    return (
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 32px' }}>
            <WelcomeBanner
                className={styles['kb-banner']}
                title={<><i className="fas fa-book-open"></i> Course Knowledge Base</>}
                subtitle="Upload course materials to power AI-assisted tutoring for students"
                style={{ marginBottom: '3.5rem' }}
            />

            <div className={styles['kb-body']}>
                <div className={styles['panel-card']}>
                    <CoursePanel
                        courses={courses}
                        summaryMap={summaryMap}
                        selectedCourseId={selectedCourseId}
                        onSelect={onSelectCourse}
                        loading={loadingCourses}
                    />
                </div>

                <div className={styles['main-card']}>
                    {!selectedCourseId ? (
                        <div className={styles['placeholder']}>
                            <i className="fas fa-arrow-left" />
                            <p>Select a course from the left panel to manage its knowledge base.</p>
                        </div>
                    ) : (
                        <DocumentManager
                            courseId={selectedCourseId}
                            courseName={selectedCourse?.name ?? selectedCourseId}
                            documents={documents}
                            loadingDocs={loadingDocs}
                            uploadTasks={uploadTasks}
                            deletingDoc={deletingDoc}
                            onUploadFile={onUploadFile}
                            onDeleteDoc={onDeleteDoc}
                            onDismissUploadTasks={onDismissUploadTasks}
                            uploading={uploading}
                            chapters={chapters}
                            selectedChapterId={selectedChapterId}
                            onSelectChapter={onSelectChapter}
                            onCreateChapter={onCreateChapter}
                            onUpdateChapter={onUpdateChapter}
                            onDeleteChapter={onDeleteChapter}
                            onReassignDocChapter={onReassignDocChapter}
                            useFastExtract={useFastExtract}
                            onToggleExtractMode={onToggleExtractMode}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
