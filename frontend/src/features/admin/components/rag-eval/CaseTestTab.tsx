import React, { useState } from 'react';
import styles from '../../styles/RagEvalPanel.module.css';
import * as api from '../../api/ragEvalApi';
import type { CaseTestResult } from '../../api/ragEvalApi';
import { TOP_K_OPTIONS } from './constants';

export default function CaseTestTab() {
    const [courseId, setCourseId] = useState('');
    const [query, setQuery] = useState('');
    const [topK, setTopK] = useState(5);
    const [useHybrid, setUseHybrid] = useState(true);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<CaseTestResult | null>(null);

    const handleTest = async () => {
        if (!courseId.trim() || !query.trim()) return;
        setTesting(true);
        try {
            const response = await api.caseTest(courseId.trim(), query.trim(), topK, useHybrid);
            setResult(response);
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            alert(message || 'Test failed');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div>
            <h3 className={styles.ragSectionTitleSpaced}>Single Query Test</h3>
            <div className={styles.ragFormCard}>
                <div className={styles.ragInlineFormRowTight}>
                    <input className={`${styles.formInput} ${styles.ragControlMedium}`} placeholder="Course ID" value={courseId} onChange={e => setCourseId(e.target.value)} />
                    <label className={styles.ragToggleLabel}>
                        top_k:
                        <select className={`${styles.formInput} ${styles.ragControlSmall}`} value={topK} onChange={e => setTopK(+e.target.value)}>
                            {TOP_K_OPTIONS.map(v => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.ragToggleLabel}>
                        <input type="checkbox" checked={useHybrid} onChange={e => setUseHybrid(e.target.checked)} />
                        Hybrid
                    </label>
                </div>
                <div className={styles.ragInlineFormRow}>
                    <input
                        className={`${styles.formInput} ${styles.ragControlGrow}`}
                        placeholder="Enter query to test..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleTest()}
                    />
                    <button className={styles.btnPrimary} onClick={handleTest} disabled={testing || !courseId.trim() || !query.trim()}>
                        {testing ? 'Testing...' : 'Test'}
                    </button>
                </div>
            </div>

            {result && (
                <div>
                    <p className={styles.ragStatusText}>
                        Latency: <strong>{result.latency_ms} ms</strong> · Results: <strong>{result.results.length}</strong> · Hybrid: {result.use_hybrid ? 'Yes' : 'No'}
                    </p>
                    <table className={`${styles.dataTable} ${styles.ragTableCompactSmall}`}>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Doc</th>
                                <th>Score</th>
                                <th>Text (preview)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.results.map((row, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>{row.doc_name || '-'}</td>
                                    <td>{typeof row.score === 'number' ? row.score.toFixed(3) : '-'}</td>
                                    <td className={styles.ragEllipsisCell}>{row.text?.slice(0, 200) || '-'}</td>
                                </tr>
                            ))}
                            {result.results.length === 0 && (
                                <tr>
                                    <td colSpan={4} className={styles.ragEmptyCell}>
                                        No results returned
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
