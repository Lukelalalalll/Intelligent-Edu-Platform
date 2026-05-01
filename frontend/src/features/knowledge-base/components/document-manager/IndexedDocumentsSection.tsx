import React, { useRef, useEffect, useState } from 'react';
import styles from '../../styles/KnowledgeBase.module.css';
import DocumentRow from '../DocumentRow';

export default function IndexedDocumentsSection({
    loadingDocs,
    documents,
    onDeleteDoc,
    deletingDoc,
    chapters,
    onReassignDocChapter,
    uploading,
}: {
    loadingDocs: boolean;
    documents: any[];
    onDeleteDoc: (docName: string) => void;
    deletingDoc: string | null;
    chapters: any[];
    onReassignDocChapter: (docName: string, chapterId: string) => void;
    uploading?: boolean;
}) {
    // Track previous doc count to detect new docs appearing
    const prevCountRef = useRef(documents.length);
    const [justRefreshed, setJustRefreshed] = useState(false);

    useEffect(() => {
        if (documents.length > prevCountRef.current) {
            setJustRefreshed(true);
            const t = setTimeout(() => setJustRefreshed(false), 600);
            return () => clearTimeout(t);
        }
        prevCountRef.current = documents.length;
    }, [documents.length]);

    return (
        <div className={styles['doc-list-section']}>
            <h4 className={styles['doc-list-title']}>
                <i className="fas fa-database"></i> Indexed Documents
                {!loadingDocs && <span className={styles['doc-count']}>{documents.length}</span>}
            </h4>

            {loadingDocs ? (
                <div className={styles['spinner-wrapper']}><div className={styles['spinner']} /></div>
            ) : documents.length === 0 ? (
                <p className={styles['empty-hint']}>No documents indexed yet. Upload files above to build the knowledge base.</p>
            ) : (
                <div className={styles['doc-list']}>
                    {documents.map((d, idx) => (
                        <div
                            key={d.doc_name}
                            className={`${styles.documentEntry} ${justRefreshed ? styles['doc-entry-appear'] : ''}`}
                            style={justRefreshed ? { animationDelay: `${idx * 0.05}s` } : undefined}
                        >
                            <DocumentRow doc={d} onDelete={onDeleteDoc} deleting={deletingDoc === d.doc_name} />
                            <div className={styles.docChapterRow}>
                                <span className={styles.docChapterLabel}>Chapter:</span>
                                <select
                                    value={d.chapter_id || ''}
                                    onChange={e => onReassignDocChapter(d.doc_name, e.target.value)}
                                    className={styles.docChapterSelect}
                                >
                                    <option value="">Unassigned</option>
                                    {chapters.map(ch => (
                                        <option key={ch.chapter_id} value={ch.chapter_id}>{ch.chapter_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
