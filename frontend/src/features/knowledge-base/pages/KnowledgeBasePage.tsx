import React from 'react';
import KnowledgeBaseView from '../components/KnowledgeBaseView';
import { useKnowledgeBase } from '../hooks/useKnowledgeBase';

export default function KnowledgeBasePageContainer() {
    const kb = useKnowledgeBase();

    return (
        <KnowledgeBaseView
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
            onReassignDocChapter={kb.onReassignDocChapter}
        />
    );
}
