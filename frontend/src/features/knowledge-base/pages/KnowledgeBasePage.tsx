import React from 'react';
import KnowledgeBasePage from '../index';
import { useKnowledgeBase } from '../hooks/useKnowledgeBase';

export default function KnowledgeBasePageContainer() {
    const kb = useKnowledgeBase();

    return (
        <KnowledgeBasePage
            courses={kb.courses}
            summaryMap={kb.summaryMap}
            selectedCourseId={kb.selectedCourseId}
            onSelectCourse={kb.onSelectCourse}
            documents={kb.documents}
            loadingCourses={kb.loadingCourses}
            loadingDocs={kb.loadingDocs}
            uploadTasks={kb.uploadTasks}
            deletingDoc={kb.deletingDoc}
            onUploadFile={kb.onUploadFile}
            onDeleteDoc={kb.onDeleteDoc}
            uploading={kb.uploading}
            chapters={kb.chapters}
            selectedChapterId={kb.selectedChapterId}
            onSelectChapter={kb.onSelectChapter}
            onCreateChapter={kb.onCreateChapter}
            onUpdateChapter={kb.onUpdateChapter}
            onDeleteChapter={kb.onDeleteChapter}
            selectedChapterConfig={kb.selectedChapterConfig}
            onSaveChapterConfig={kb.onSaveChapterConfig}
            onReassignDocChapter={kb.onReassignDocChapter}
            reports={kb.reports}
            onSaveReportComment={kb.onSaveReportComment}
        />
    );
}
