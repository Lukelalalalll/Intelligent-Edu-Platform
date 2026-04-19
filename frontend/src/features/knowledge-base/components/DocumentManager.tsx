import React, { useState } from 'react';
import styles from '../styles/docCards.module.css';
import UploadZone from './UploadZone';
import AddChapterModal from './document-manager/AddChapterModal';
import TestRetrievalPanel from './document-manager/TestRetrievalPanel';
import ChapterManagementSection from './document-manager/ChapterManagementSection';
import UploadTasksSection from './document-manager/UploadTasksSection';
import IndexedDocumentsSection from './document-manager/IndexedDocumentsSection';
import { useDocumentManagerState } from '../hooks/useDocumentManagerState';
import type { DocumentManagerProps, UploadTask } from '../types';

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
    onDismissUploadTasks,
    uploading,
    chapters,
    selectedChapterId,
    onSelectChapter,
    onCreateChapter,
    onUpdateChapter,
    onDeleteChapter,
    onReassignDocChapter,
}: DocumentManagerProps) {
    const dm = useDocumentManagerState({
        courseId,
        selectedChapterId,
        chapters,
        onCreateChapter,
        onUpdateChapter,
        onDeleteChapter,
    });

    const [activeTab, setActiveTab] = useState<'manage' | 'test'>('manage');

    return (
        <section className={styles['doc-manager']}>
            <div className={styles['doc-manager-header']}>
                <div className={styles['header-left']}>
                    <h3>{courseName}</h3>
                    <span className={styles['course-id-tag']}>{courseId}</span>
                </div>
                <div className={styles.tabSwitcher}>
                    <button
                        className={`${styles.tabBtn} ${activeTab === 'manage' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('manage')}
                    >
                        <i className="fas fa-folder-open"></i> Manage Content
                    </button>
                    <button
                        className={`${styles.tabBtn} ${activeTab === 'test' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('test')}
                    >
                        <i className="fas fa-search"></i> Test Retrieval
                    </button>
                </div>
            </div>

            <div className={styles.tabContent}>
                {activeTab === 'manage' && (
                    <>
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

                        <UploadZone courseId={courseId} onUpload={onUploadFile} disabled={uploading} />

                        <UploadTasksSection uploadTasks={uploadTasks as UploadTask[]} onDismissFinished={onDismissUploadTasks} />

                        <IndexedDocumentsSection
                            loadingDocs={loadingDocs}
                            documents={documents}
                            onDeleteDoc={onDeleteDoc}
                            deletingDoc={deletingDoc}
                            chapters={chapters}
                            onReassignDocChapter={onReassignDocChapter}
                        />
                    </>
                )}

                {activeTab === 'test' && (
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
                )}
            </div>

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
