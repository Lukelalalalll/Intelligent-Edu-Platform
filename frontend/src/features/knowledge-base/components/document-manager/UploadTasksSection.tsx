import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';
import SharedConfirmModal from '../../../../shared/components/ConfirmModal';
import type { UploadTask } from '../../types';

function phaseLabel(t: UploadTask): string {
    if (t.status === 'uploading') return `Uploading ${t.progress}%`;
    if (t.phase === 'extracting') return `Extracting ${t.progress}%`;
    if (t.phase === 'indexing') return `Building index ${t.progress}%`;
    return `Processing ${t.progress}%`;
}

export default function UploadTasksSection({
    uploadTasks,
    onDismissFinished,
}: {
    uploadTasks: UploadTask[];
    onDismissFinished: () => void;
}) {
    const inProgress = uploadTasks.filter(t => t.status === 'uploading' || t.status === 'indexing');
    const finished = uploadTasks.filter(t => t.status === 'done' || t.status === 'error');

    const successCount = finished.filter(t => t.status === 'done').length;
    const errorCount = finished.filter(t => t.status === 'error').length;

    const summaryLines = finished.map(t =>
        t.status === 'done'
            ? `${t.file.name} - ${t.chunkCount ?? 0} nodes indexed${t.indexVersion ? ` (${t.indexVersion})` : ''}${t.parserUsed ? ` via ${t.parserUsed}` : ''}`
            : `${t.file.name} - ${t.error || 'Failed'}`,
    );

    const title = errorCount > 0
        ? (successCount > 0 ? 'Upload Partially Complete' : 'Upload Failed')
        : 'Upload Complete';

    return (
        <>
            {inProgress.length > 0 && (
                <div className={styles['upload-tasks']}>
                    {inProgress.map(t => (
                        <div key={t.taskId} className={styles['upload-task']}>
                            <div className={styles['upload-task-info']}>
                                <i className={`fas ${t.status === 'indexing' ? 'fa-cog fa-spin' : 'fa-file-upload'}`} />
                                <span>{t.file.name}</span>
                                <span className={styles['upload-task-status']}>{phaseLabel(t)}</span>
                            </div>
                            <div className={styles['progress-bar']}>
                                <div
                                    className={styles['progress-fill']}
                                    style={{ width: `${Math.max(t.progress, 4)}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
