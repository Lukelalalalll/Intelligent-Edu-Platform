import React, { useState } from 'react';
import styles from '../styles/KnowledgeBase.module.css';
import type { IndexedDoc } from '../../../api/knowledgeBaseApi';

interface DocumentRowProps {
    doc: IndexedDoc;
    onDelete: (docName: string) => void;
    deleting: boolean;
}

export default function DocumentRow({ doc, onDelete, deleting }: DocumentRowProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const ext = doc.doc_name.split('.').pop()?.toLowerCase() ?? '';
    const iconClass = ext === 'pdf' ? 'fa-file-pdf' : ext === 'md' || ext === 'markdown' ? 'fa-file-alt' : 'fa-file';

    const handleDelete = () => {
        onDelete(doc.doc_name);
        setConfirmOpen(false);
    };

    const timeLabel = doc.indexed_at
        ? new Date(doc.indexed_at).toLocaleString()
        : '—';

    return (
        <div className={`${styles['doc-row']} ${deleting ? styles['doc-row-deleting'] : ''}`}>
            <div className={styles['doc-row-left']}>
                <i className={`fas ${iconClass} ${styles['doc-icon']}`} />
                <div>
                    <span className={styles['doc-name']}>{doc.doc_name}</span>
                    <span className={styles['doc-meta']}>
                        {doc.chunk_count} chunk{doc.chunk_count !== 1 ? 's' : ''} · {timeLabel}
                    </span>
                </div>
            </div>
            <div className={styles['doc-row-right']}>
                {confirmOpen ? (
                    <span className={styles['confirm-inline']}>
                        <span>Delete?</span>
                        <button className={styles['confirm-yes']} onClick={handleDelete} disabled={deleting}>Yes</button>
                        <button className={styles['confirm-no']} onClick={() => setConfirmOpen(false)}>No</button>
                    </span>
                ) : (
                    <button
                        className={styles['delete-btn']}
                        onClick={() => setConfirmOpen(true)}
                        disabled={deleting}
                        title="Remove from knowledge base"
                    >
                        <i className="fas fa-trash-alt" />
                    </button>
                )}
            </div>
        </div>
    );
}
