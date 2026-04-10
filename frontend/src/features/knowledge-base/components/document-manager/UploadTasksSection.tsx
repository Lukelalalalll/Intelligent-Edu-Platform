import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';
import type { UploadTask } from './types';

export default function UploadTasksSection({ uploadTasks }: { uploadTasks: UploadTask[] }) {
    if (uploadTasks.length === 0) return null;

    return (
        <div className={styles['upload-tasks']}>
            {uploadTasks.map(t => (
                <div key={t.taskId} className={styles['upload-task']}>
                    <div className={styles['upload-task-info']}>
                        <i className="fas fa-file" />
                        <span>{t.file.name}</span>
                        {t.status === 'done' && <span className={styles['upload-ok']}>✓ {t.chunkCount} chunks</span>}
                        {t.status === 'error' && <span className={styles['upload-err']}>{t.error || 'Failed'}</span>}
                    </div>
                    {t.status === 'uploading' && (
                        <div className={styles['progress-bar']}>
                            <div className={styles['progress-fill']} style={{ width: `${t.progress}%` }} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
