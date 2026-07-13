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
                                                title="No expected_doc_names or expected_keywords, this case cannot be evaluated"
                                                style={{ marginLeft: 6, fontSize: 11, color: '#f59e0b', cursor: 'default' }}
                                            >
                                                no criteria
                                            </span>
                                        )}
                                    </td>
                                    {hasHybrid && isComparison && (
                                        <td className={hd?.degenerate ? '' : hd?.hit ? styles.hitOk : styles.hitMiss}>
                                            {hd?.degenerate ? '-' : hd?.hit ? 'HIT' : 'MISS'}
                                        </td>
                                    )}
                                    {hasVector && isComparison && (
                                        <td className={vd?.degenerate ? '' : vd?.hit ? styles.hitOk : styles.hitMiss}>
                                            {vd?.degenerate ? '-' : vd?.hit ? 'HIT' : 'MISS'}
                                        </td>
                                    )}
                                    {!isComparison && (
                                        <td className={d.degenerate ? '' : d.hit ? styles.hitOk : styles.hitMiss}>
                                            {d.degenerate ? '-' : d.hit ? 'HIT' : 'MISS'}
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
                                                <DetailBlock label="Hybrid" detail={hd} />
                                            )}
                                            {isComparison && vd && (
                                                <DetailBlock label="Vector" detail={vd} />
                                            )}
                                            {!isComparison && (
                                                <DetailBlock detail={d} />
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

function DetailBlock({ detail, label }: { detail: EvalDetail; label?: string }) {
    return (
        <div style={{ marginBottom: 10 }}>
            {label && <div className={styles.detailModeLabel}>{label}</div>}
            <div className={styles.detailMetaGrid}>
                <div className={styles.detailMetaCard}>
                    <div className={styles.detailMetaLabel}>Query class</div>
                    <div className={styles.detailMetaValue}>{detail.retrieval_plan?.query_class || 'auto'}</div>
                </div>
                <div className={styles.detailMetaCard}>
                    <div className={styles.detailMetaLabel}>Confidence</div>
                    <div className={styles.detailMetaValue}>
                        {detail.retrieval_confidence?.label || 'unknown'}
                        {typeof detail.retrieval_confidence?.score === 'number' ? ` · ${detail.retrieval_confidence.score.toFixed(3)}` : ''}
                    </div>
                </div>
                <div className={styles.detailMetaCard}>
                    <div className={styles.detailMetaLabel}>Fallback</div>
                    <div className={styles.detailMetaValue}>{detail.fallback_reason || 'none'}</div>
                </div>
            </div>

            {detail.retrieval_trace?.length ? (
                <div className={styles.detailTraceList}>
                    {detail.retrieval_trace.map((item, idx) => (
                        <div key={`${item.stage}_${idx}`} className={styles.detailTraceRow}>
                            <span className={styles.detailTraceStage}>{item.stage}</span>
                            <span className={styles.detailTraceText}>
                                {typeof item.count === 'number' ? `${item.count} items` : item.query || (item.queries?.join(' | ') ?? '')}
                            </span>
                            {typeof item.latency_ms === 'number' && <span className={styles.detailTraceText}>{item.latency_ms.toFixed(1)} ms</span>}
                        </div>
                    ))}
                </div>
            ) : null}

            <ChunkList chunks={detail.chunks} />
        </div>
    );
}

function ChunkList({ chunks }: { chunks: { doc: string; score: number; preview: string; correct?: boolean }[] }) {
    if (chunks.length === 0) {
        return <div className={styles.chunkPanel} style={{ opacity: 0.6 }}>No chunks retrieved</div>;
    }

    return (
        <div style={{ marginBottom: 8 }}>
            {chunks.map((c, j) => (
                <div
                    key={j}
                    className={styles.chunkPanel}
                    style={c.correct === false ? { borderLeft: '3px solid #ef4444' } : c.correct === true ? { borderLeft: '3px solid #22c55e' } : undefined}
                >
                    <div className={styles.chunkHeader}>
                        <span>{c.doc || '(unknown)'}</span>
                        <span>score: {typeof c.score === 'number' ? c.score.toFixed(3) : '-'}</span>
                    </div>
                    <div className={styles.chunkPreview}>{c.preview || '(empty)'}</div>
                </div>
            ))}
        </div>
    );
}
