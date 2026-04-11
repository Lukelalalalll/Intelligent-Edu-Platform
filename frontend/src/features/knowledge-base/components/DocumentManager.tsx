import React from 'react';
import styles from '../styles/docCards.module.css';
import UploadZone from './UploadZone';
import AddChapterModal from './document-manager/AddChapterModal';
import TestRetrievalPanel from './document-manager/TestRetrievalPanel';
import DiagnosticReportsPanel from './document-manager/DiagnosticReportsPanel';
import ChapterManagementSection from './document-manager/ChapterManagementSection';
import DiagnosticConfigSection from './document-manager/DiagnosticConfigSection';
import UploadTasksSection from './document-manager/UploadTasksSection';
import IndexedDocumentsSection from './document-manager/IndexedDocumentsSection';
import { useDocumentManagerState } from './document-manager/useDocumentManagerState';
import type { DocumentManagerProps, UploadTask } from './document-manager/types';

export type { UploadTask };

export default function DocumentManager({
    courseId,
    courseName,
    documents,
    loadingDocs,
    uploadTasks,
    deletingDoc,
    onUploadFile,
    onDeleteDoc,
    uploading,
    chapters,
    selectedChapterId,
    onSelectChapter,
    onCreateChapter,
    onUpdateChapter,
    onDeleteChapter,
    selectedChapterConfig,
    onSaveChapterConfig,
    onReassignDocChapter,
    reports,
    onSaveReportComment,
}: DocumentManagerProps) {
    const dm = useDocumentManagerState({
        courseId,
        selectedChapterId,
        selectedChapterConfig,
        chapters,
        onCreateChapter,
        onUpdateChapter,
        onDeleteChapter,
    });

    return (
        <section className={styles['doc-manager']}>
            <div className={styles['doc-manager-header']}>
                <h3>{courseName}</h3>
                <span className={styles['course-id-tag']}>{courseId}</span>
            </div>

            <div className={styles.chapterToolbar}>
                <select value={selectedChapterId} onChange={e => onSelectChapter(e.target.value)} className={styles.chapterSelect}>
                    {chapters.length === 0 && <option value="">No chapter configured</option>}
                    {chapters.map(c => (
                        <option key={c.chapter_id} value={c.chapter_id}>{`#${c.chapter_order} ${c.chapter_name}`}</option>
                    ))}
                </select>
                <button onClick={dm.openAddChapterModal} className={styles.addChapterBtn}>
                    <i className="fas fa-plus"></i> Add Chapter
                </button>
            </div>

            {dm.chapterActionError && <p className={`${styles['empty-hint']} ${styles.chapterActionError}`}>{dm.chapterActionError}</p>}
            {dm.chapterActionSuccess && <p className={`${styles['empty-hint']} ${styles.chapterActionSuccess}`}>{dm.chapterActionSuccess}</p>}

            {!selectedChapterId && (
                <p className={`${styles['empty-hint']} ${styles.chapterHint}`}>
                    Select a chapter first. Knowledge files must be uploaded into a chapter.
                </p>
            )}

            <ChapterManagementSection
                chapters={chapters}
                chapterDraftMap={dm.chapterDraftMap}
                setChapterDraftMap={dm.setChapterDraftMap}
                selectedChapterId={selectedChapterId}
                onSelectChapter={onSelectChapter}
                handleUpdateChapter={dm.handleUpdateChapter}
                handleDeleteChapter={dm.handleDeleteChapter}
                chapterBusy={dm.chapterBusy}
            />

            <DiagnosticConfigSection
                selectedChapterId={selectedChapterId}
                configDraft={dm.configDraft}
                setConfigDraft={dm.setConfigDraft}
                onSaveChapterConfig={onSaveChapterConfig}
            />

            <UploadZone courseId={courseId} onUpload={onUploadFile} disabled={uploading || !selectedChapterId} />

            <UploadTasksSection uploadTasks={uploadTasks as UploadTask[]} />

            <IndexedDocumentsSection
                loadingDocs={loadingDocs}
                documents={documents}
                onDeleteDoc={onDeleteDoc}
                deletingDoc={deletingDoc}
                chapters={chapters}
                onReassignDocChapter={onReassignDocChapter}
            />

            <TestRetrievalPanel
                testQuery={dm.testQuery}
                testTopK={dm.testTopK}
                testLatency={dm.testLatency}
                testLoading={dm.testLoading}
                testResults={dm.testResults}
                onChangeQuery={dm.setTestQuery}
                onChangeTopK={dm.setTestTopK}
                onSearch={dm.handleTestRetrieval}
            />

            <DiagnosticReportsPanel
                reports={reports}
                reportCommentMap={dm.reportCommentMap}
                onChangeComment={(reportId, value) => dm.setReportCommentMap(prev => ({ ...prev, [reportId]: value }))}
                onSaveComment={(reportId, value) => onSaveReportComment(reportId, value)}
            />

            <AddChapterModal
                isOpen={dm.isAddChapterModalOpen}
                busy={dm.chapterBusy}
                chapterName={dm.newChapterName}
                chapterDescription={dm.newChapterDescription}
                error={dm.chapterActionError}
                onClose={() => dm.setIsAddChapterModalOpen(false)}
                onChangeChapterName={dm.setNewChapterName}
                onChangeChapterDescription={dm.setNewChapterDescription}
                onCreate={dm.handleCreateChapter}
            />
        </section>
    );
}
