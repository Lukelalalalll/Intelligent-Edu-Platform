import React, { useState } from 'react';
import styles from '../styles/KnowledgeBase.module.css';
import type { IndexedDoc } from '../../../api/knowledgeBaseApi';

interface DocumentRowProps {
    doc: IndexedDoc;
    onDelete: (docName: string) => void;
    onViewDetails: (docName: string) => void;
    deleting: boolean;
}

export default function DocumentRow({ doc, onDelete, onViewDetails, deleting }: DocumentRowProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const ext = doc.doc_name.split('.').pop()?.toLowerCase() ?? '';
    const iconClass = ext === 'pdf' ? 'fa-file-pdf' : ext === 'md' || ext === 'markdown' ? 'fa-file-alt' : 'fa-file';

    const handleDelete = () => {
        onDelete(doc.doc_name);
        setConfirmOpen(false);
    };

    const timeLabel = doc.indexed_at
        ? new Date(doc.indexed_at).toLocaleString()
        : '-';

    return (
        <div className={`${styles['doc-row']} ${deleting ? styles['doc-row-deleting'] : ''}`}>
            <div className={styles['doc-row-left']}>
                <i className={`fas ${iconClass} ${styles['doc-icon']}`} />
                <div>
                    <span className={styles['doc-name']}>{doc.doc_name}</span>
                    <span className={styles['doc-meta']}>
                        {doc.chunk_count} nodes · {timeLabel}
                        {doc.page_count ? ` · ${doc.page_count} page${doc.page_count === 1 ? '' : 's'}` : ''}
                        {doc.parser_used ? ` · ${doc.parser_used}` : ''}
                        {doc.index_version ? ` · ${doc.index_version}` : ''}
                    </span>
                    <div className={styles.docBadges}>
                        {doc.quality_status && <span className={styles.docBadge}>{doc.quality_status}</span>}
                        {doc.node_counts && Object.entries(doc.node_counts).map(([key, value]) => (
                            <span key={key} className={styles.docBadgeMuted}>{key}:{value}</span>
                        ))}
                    </div>
                </div>
            </div>
            <div className={styles['doc-row-right']}>
                <button
                    className={`${styles.docActionBtn} ${styles.diagnosticsBtn}`}
                    onClick={() => onViewDetails(doc.doc_name)}
                    disabled={deleting}
                    title="View parser and quality diagnostics"
                >
                    <i className="fas fa-info-circle" />
                </button>
                {confirmOpen ? (
                    <span className={styles['confirm-inline']}>
                        <span>Delete?</span>
                        <button className={styles['confirm-yes']} onClick={handleDelete} disabled={deleting}>Yes</button>
                        <button className={styles['confirm-no']} onClick={() => setConfirmOpen(false)}>No</button>
                    </span>
                ) : (
                    <button
                        className={`${styles['delete-btn']} ${styles.docActionBtn}`}
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
