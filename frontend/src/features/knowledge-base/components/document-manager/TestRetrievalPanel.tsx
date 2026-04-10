import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';

interface RetrievalResult {
    course_id: string;
    text: string;
    score: number;
    doc_name: string;
    chapter_id?: string;
}

interface TestRetrievalPanelProps {
    testQuery: string;
    testTopK: number;
    testLatency: number | null;
    testLoading: boolean;
    testResults: RetrievalResult[] | null;
    onChangeQuery: (value: string) => void;
    onChangeTopK: (value: number) => void;
    onSearch: () => void;
}

export default function TestRetrievalPanel({
    testQuery,
    testTopK,
    testLatency,
    testLoading,
    testResults,
    onChangeQuery,
    onChangeTopK,
    onSearch,
}: TestRetrievalPanelProps) {
    return (
        <div className={`${styles['doc-list-section']} ${styles.retrievalSection}`}>
            <h4 className={styles['doc-list-title']}>
                <i className="fas fa-search"></i> Test Retrieval
            </h4>

            <div className={styles.retrievalToolbar}>
                <input
                    type="text"
                    placeholder="Enter a question to test retrieval quality..."
                    value={testQuery}
                    onChange={e => onChangeQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onSearch()}
                    className={styles.retrievalInput}
                />
                <select
                    value={testTopK}
                    onChange={e => onChangeTopK(Number(e.target.value))}
                    className={styles.retrievalTopKSelect}
                >
                    {[3, 5, 10].map(k => <option key={k} value={k}>Top {k}</option>)}
                </select>
                <button
                    onClick={onSearch}
                    disabled={testLoading || !testQuery.trim()}
                    className={styles.retrievalSearchBtn}
                >
                    {testLoading ? 'Searching...' : 'Search'}
                </button>
            </div>

            {testResults !== null && (
                <div>
                    <div className={styles.retrievalMeta}>
                        {testResults.length} result(s) in {testLatency ?? '-'}ms
                    </div>

                    {testResults.length === 0 ? (
                        <p className={styles.retrievalEmpty}>No matching chunks found. Try a different query or upload more documents.</p>
                    ) : (
                        <div className={styles.retrievalResultList}>
                            {testResults.map((r, i) => (
                                <div key={`${r.doc_name}_${i}`} className={styles.retrievalResultItem}>
                                    <div className={styles.retrievalResultHead}>
                                        <span>{r.doc_name || 'Unknown'}</span>
                                        <span className={styles.retrievalScore}>score: {r.score.toFixed(4)}</span>
                                    </div>
                                    <div className={styles.retrievalResultText}>{r.text}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
