import React, { useState } from 'react';
import styles from '../styles/RagEvaluator.module.css';
import type { EvalDetail } from '../api/ragEvaluatorApi';

interface Props {
    hybridDetails?: EvalDetail[];
    vectorDetails?: EvalDetail[];
    isComparison: boolean;
}

export default function QuestionDetailTable({ hybridDetails, vectorDetails, isComparison }: Props) {
    const [expandedRow, setExpandedRow] = useState<number | null>(null);

    const details = hybridDetails || vectorDetails || [];
    const hasHybrid = !!hybridDetails;
    const hasVector = !!vectorDetails;

    const toggleExpand = (i: number) => {
        setExpandedRow(expandedRow === i ? null : i);
    };

    return (
        <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
                <thead>
                    <tr>
                        <th style={{ width: 36, textAlign: 'center' }}>#</th>
                        <th>Query</th>
                        {hasHybrid && isComparison && <th style={{ width: 70, textAlign: 'center' }}>Hybrid</th>}
                        {hasVector && isComparison && <th style={{ width: 70, textAlign: 'center' }}>Vector</th>}
                        {!isComparison && <th style={{ width: 80, textAlign: 'center' }}>Result</th>}
                        <th style={{ width: 70, textAlign: 'center' }}>Retrieved</th>
                        <th style={{ width: 80, textAlign: 'center' }}>Correct</th>
                        {hybridDetails?.[0]?.latency_ms !== undefined && <th style={{ width: 70, textAlign: 'center' }}>Latency</th>}
                        <th style={{ width: 40 }} />
                    </tr>
                </thead>
                <tbody>
                    {details.map((d, i) => {
                        const hd = hybridDetails?.[i];
                        const vd = vectorDetails?.[i];
                        const isExpanded = expandedRow === i;

                        return (
                            <React.Fragment key={d.id || i}>
                                <tr>
                                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                    <td className={styles.queryCell} title={d.query}>
                                        {d.query}
                                        {d.degenerate && (
                                            <span
                                                title="No expected_doc_names or expected_keywords — this case cannot be evaluated"
                                                style={{ marginLeft: 6, fontSize: 11, color: '#f59e0b', cursor: 'default' }}
                                            >
                                                ⚠️ no criteria
                                            </span>
                                        )}
                                    </td>
                                    {hasHybrid && isComparison && (
                                        <td className={hd?.degenerate ? '' : hd?.hit ? styles.hitOk : styles.hitMiss}>
                                            {hd?.degenerate ? '—' : hd?.hit ? '✅' : '❌'}
                                        </td>
                                    )}
                                    {hasVector && isComparison && (
                                        <td className={vd?.degenerate ? '' : vd?.hit ? styles.hitOk : styles.hitMiss}>
                                            {vd?.degenerate ? '—' : vd?.hit ? '✅' : '❌'}
                                        </td>
                                    )}
                                    {!isComparison && (
                                        <td className={d.degenerate ? '' : d.hit ? styles.hitOk : styles.hitMiss}>
                                            {d.degenerate ? '—' : d.hit ? '✅ HIT' : '❌ MISS'}
                                        </td>
                                    )}
                                    <td style={{ textAlign: 'center' }}>{d.retrieved_count}</td>
                                    <td style={{ textAlign: 'center' }}>{d.correct_citations}</td>
                                    {d.latency_ms !== undefined && <td style={{ textAlign: 'center' }}>{d.latency_ms} ms</td>}
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className={styles.expandBtn}
                                            onClick={() => toggleExpand(i)}
                                        >
                                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} />
                                        </button>
                                    </td>
                                </tr>
                                {isExpanded && (
                                    <tr>
                                        <td colSpan={99}>
                                            {isComparison && hd && (
                                                <ChunkList label="Hybrid" chunks={hd.chunks} />
                                            )}
                                            {isComparison && vd && (
                                                <ChunkList label="Vector" chunks={vd.chunks} />
                                            )}
                                            {!isComparison && (
                                                <ChunkList chunks={d.chunks} />
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ChunkList({ chunks, label }: { chunks: { doc: string; score: number; preview: string; correct?: boolean }[]; label?: string }) {
    if (chunks.length === 0) {
        return <div className={styles.chunkPanel} style={{ opacity: 0.6 }}>No chunks retrieved</div>;
    }

    return (
        <div style={{ marginBottom: 8 }}>
            {label && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>{label}</div>}
            {chunks.map((c, j) => (
                <div key={j} className={styles.chunkPanel} style={c.correct === false ? { borderLeft: '3px solid #ef4444' } : c.correct === true ? { borderLeft: '3px solid #22c55e' } : undefined}>
                    <div className={styles.chunkHeader}>
                        <span>
                            {c.correct === true && <span style={{ color: '#22c55e', marginRight: 4 }}>✓</span>}
                            {c.correct === false && <span style={{ color: '#ef4444', marginRight: 4 }}>✗</span>}
                            {c.doc || '(unknown)'}
                        </span>
                        <span>score: {typeof c.score === 'number' ? c.score.toFixed(3) : '—'}</span>
                    </div>
                    <div className={styles.chunkPreview}>{c.preview || '(empty)'}</div>
                </div>
            ))}
        </div>
    );
}
