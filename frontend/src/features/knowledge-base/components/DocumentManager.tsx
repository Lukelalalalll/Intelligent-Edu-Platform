import React, { useState } from 'react';
import styles from '../styles/KnowledgeBase.module.css';
import UploadZone from './UploadZone';
import DocumentRow from './DocumentRow';
import { knowledgeBaseApi } from '../../../api/knowledgeBaseApi';
import type { IndexedDoc } from '../../../api/knowledgeBaseApi';

export interface UploadTask {
    taskId: string;
    file: File;
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
    chunkCount?: number;
}

interface DocumentManagerProps {
    courseId: string;
    courseName: string;
    documents: IndexedDoc[];
    loadingDocs: boolean;
    uploadTasks: UploadTask[];
    deletingDoc: string | null;
    onUploadFile: (file: File) => void;
    onDeleteDoc: (docName: string) => void;
    uploading: boolean;
}

export default function DocumentManager({
    courseId, courseName, documents, loadingDocs,
    uploadTasks, deletingDoc, onUploadFile, onDeleteDoc, uploading,
}: DocumentManagerProps) {
    const [testQuery, setTestQuery] = useState('');
    const [testTopK, setTestTopK] = useState(5);
    const [testResults, setTestResults] = useState<{ course_id: string; text: string; score: number; doc_name: string }[] | null>(null);
    const [testLatency, setTestLatency] = useState<number | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    const handleTestRetrieval = async () => {
        if (!testQuery.trim() || testLoading) return;
        setTestLoading(true);
        setTestResults(null);
        try {
            const res = await knowledgeBaseApi.testRetrieval(courseId, testQuery.trim(), testTopK);
            setTestResults(res.results);
            setTestLatency(res.latency_ms);
        } catch {
            setTestResults([]);
        } finally {
            setTestLoading(false);
        }
    };

    return (
        <section className={styles['doc-manager']}>
            <div className={styles['doc-manager-header']}>
                <h3>{courseName}</h3>
                <span className={styles['course-id-tag']}>{courseId}</span>
            </div>

            <UploadZone courseId={courseId} onUpload={onUploadFile} disabled={uploading} />

            {/* Active upload tasks */}
            {uploadTasks.length > 0 && (
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
            )}

            {/* Document list */}
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
                        {documents.map(d => (
                            <DocumentRow
                                key={d.doc_name}
                                doc={d}
                                onDelete={onDeleteDoc}
                                deleting={deletingDoc === d.doc_name}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Test Retrieval Panel */}
            <div className={styles['doc-list-section']} style={{ marginTop: '24px' }}>
                <h4 className={styles['doc-list-title']}>
                    <i className="fas fa-search"></i> Test Retrieval
                </h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Enter a question to test retrieval quality..."
                        value={testQuery}
                        onChange={e => setTestQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleTestRetrieval()}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #d1d5db', fontSize: '13px', outline: 'none',
                        }}
                    />
                    <select
                        value={testTopK}
                        onChange={e => setTestTopK(Number(e.target.value))}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    >
                        {[3, 5, 10].map(k => <option key={k} value={k}>Top {k}</option>)}
                    </select>
                    <button
                        onClick={handleTestRetrieval}
                        disabled={testLoading || !testQuery.trim()}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none',
                            background: '#007B55', color: '#fff', fontWeight: 600,
                            cursor: testLoading ? 'wait' : 'pointer', fontSize: '13px',
                            opacity: testLoading || !testQuery.trim() ? 0.5 : 1,
                        }}
                    >
                        {testLoading ? 'Searching...' : 'Search'}
                    </button>
                </div>
                {testResults !== null && (
                    <div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                            {testResults.length} result(s) in {testLatency ?? '—'}ms
                        </div>
                        {testResults.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>No matching chunks found. Try a different query or upload more documents.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {testResults.map((r, i) => (
                                    <div key={i} style={{
                                        padding: '10px 12px', borderRadius: '8px',
                                        border: '1px solid #e5e7eb', background: '#fafafa',
                                        fontSize: '12px',
                                    }}>
                                        <div style={{ display: 'flex', gap: '12px', marginBottom: '4px', fontWeight: 600, color: '#111' }}>
                                            <span>{r.doc_name || 'Unknown'}</span>
                                            <span style={{ color: '#007B55', fontWeight: 400 }}>score: {r.score.toFixed(4)}</span>
                                        </div>
                                        <div style={{ color: '#4b5563', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: '100px', overflow: 'auto' }}>
                                            {r.text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
