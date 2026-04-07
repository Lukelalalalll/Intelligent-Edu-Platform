import React from 'react';
import styles from './styles/KnowledgeBase.module.css';
import CoursePanel from './components/CoursePanel';
import DocumentManager from './components/DocumentManager';
import type { CourseInfo, IndexCourseSummary, IndexedDoc } from '../../api/knowledgeBaseApi';
import type { UploadTask } from './components/DocumentManager';

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
}

export default function KnowledgeBasePage({
    courses, summaryMap, selectedCourseId, onSelectCourse,
    documents, loadingCourses, loadingDocs,
    uploadTasks, deletingDoc, onUploadFile, onDeleteDoc, uploading,
}: KnowledgeBasePageProps) {
    const selectedCourse = courses.find(c => c.courseId === selectedCourseId);

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
            <header className={styles['kb-banner']}>
                <h1><i className="fas fa-book-open"></i> Course Knowledge Base</h1>
                <p>Upload course materials to power AI-assisted tutoring for students</p>
            </header>

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
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
