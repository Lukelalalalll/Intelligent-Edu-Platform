import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';
import SharedConfirmModal from '../../../../shared/components/ConfirmModal';
import type { UploadTask } from '../../types';

export default function UploadTasksSection({
    uploadTasks,
    onDismissFinished,
}: {
    uploadTasks: UploadTask[];
    onDismissFinished: () => void;
}) {
    const inProgress = uploadTasks.filter(t => t.status === 'uploading');
    const finished = uploadTasks.filter(t => t.status === 'done' || t.status === 'error');

    const successCount = finished.filter(t => t.status === 'done').length;
    const errorCount = finished.filter(t => t.status === 'error').length;

    const summaryLines = finished.map(t =>
        t.status === 'done'
            ? `✓  ${t.file.name}  —  ${t.chunkCount ?? 0} chunks indexed`
            : `✗  ${t.file.name}  —  ${t.error || 'Failed'}`,
    );

    const title = errorCount > 0
        ? (successCount > 0 ? 'Upload Partially Complete' : 'Upload Failed')
        : 'Upload Complete';

    return (
        <>
            {/* In-progress uploads: keep inline progress bar */}
            {inProgress.length > 0 && (
                <div className={styles['upload-tasks']}>
                    {inProgress.map(t => (
                        <div key={t.taskId} className={styles['upload-task']}>
                            <div className={styles['upload-task-info']}>
                                <i className="fas fa-file" />
                                <span>{t.file.name}</span>
                            </div>
                            <div className={styles['progress-bar']}>
                                <div className={styles['progress-fill']} style={{ width: `${t.progress}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Finished uploads: show result modal */}
            <SharedConfirmModal
                open={finished.length > 0}
                title={title}
                message={summaryLines.join('\n')}
                confirmLabel="OK"
                confirmDanger={false}
                onConfirm={onDismissFinished}
                onClose={onDismissFinished}
                hideCancel
            />
        </>
    );
}
