import React from 'react';
import styles from './styles/KnowledgeBase.module.css';
import CoursePanel from './components/CoursePanel';
import DocumentManager from './components/DocumentManager';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import type { CourseInfo, IndexCourseSummary, IndexedDoc } from '../../api/knowledgeBaseApi';
import type { UploadTask } from './components/DocumentManager';
import type { DiagnosticChapter, DiagnosticConfig, DiagnosticReport } from '../diagnostic-feedback/api/diagnosticApi';

interface KnowledgeBasePageProps {
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
    uploading: boolean;
    chapters: DiagnosticChapter[];
    selectedChapterId: string;
    onSelectChapter: (chapterId: string) => void;
    onCreateChapter: (chapterName: string, description?: string) => Promise<void>;
    onUpdateChapter: (chapterId: string, payload: Partial<Pick<DiagnosticChapter, 'chapter_name' | 'chapter_order' | 'description' | 'diagnostic_enabled'>>) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
    selectedChapterConfig: DiagnosticConfig | null;
    onSaveChapterConfig: (chapterId: string, payload: { question_count: number; pass_score: number; time_limit_minutes: number }) => void;
    onReassignDocChapter: (docName: string, chapterId: string) => void;
    reports: DiagnosticReport[];
    onSaveReportComment: (reportId: string, comment: string) => void;
}

export default function KnowledgeBasePage({
    courses, summaryMap, selectedCourseId, onSelectCourse,
    documents, loadingCourses, loadingDocs,
    uploadTasks, deletingDoc, onUploadFile, onDeleteDoc, uploading,
    chapters, selectedChapterId, onSelectChapter, onCreateChapter,
    onUpdateChapter, onDeleteChapter, selectedChapterConfig, onSaveChapterConfig,
    onReassignDocChapter, reports, onSaveReportComment,
}: KnowledgeBasePageProps) {
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
                            uploading={uploading}
                            chapters={chapters}
                            selectedChapterId={selectedChapterId}
                            onSelectChapter={onSelectChapter}
                            onCreateChapter={onCreateChapter}
                            onUpdateChapter={onUpdateChapter}
                            onDeleteChapter={onDeleteChapter}
                            selectedChapterConfig={selectedChapterConfig}
                            onSaveChapterConfig={onSaveChapterConfig}
                            onReassignDocChapter={onReassignDocChapter}
                            reports={reports}
                            onSaveReportComment={onSaveReportComment}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
