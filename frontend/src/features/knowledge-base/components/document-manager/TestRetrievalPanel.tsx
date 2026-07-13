import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';
import type {
    EvidenceSpan,
    RetrievalConfidence,
    RetrievalPlan,
    RetrievalResult,
    RetrievalTraceItem,
} from '../../types';

interface TestRetrievalPanelProps {
    testQuery: string;
    testTopK: number;
    testLatency: number | null;
    testLoading: boolean;
    testResults: RetrievalResult[] | null;
    testDebug: boolean;
    activeIndexVersion: string;
    testProfile: 'low-latency' | 'balanced' | 'high-recall';
    forceQueryClass: '' | 'keyword/factoid' | 'concept/explanation' | 'comparison' | 'multi-hop' | 'chapter/doc constrained' | 'out-of-domain';
    allowWebCorrection: boolean;
    retrievalPlan: RetrievalPlan | null;
    retrievalTrace: RetrievalTraceItem[];
    retrievalConfidence: RetrievalConfidence | null;
    fallbackReason: string;
    evidenceSpans: EvidenceSpan[];
    onChangeQuery: (value: string) => void;
    onChangeTopK: (value: number) => void;
    onChangeProfile: (value: 'low-latency' | 'balanced' | 'high-recall') => void;
    onChangeForceQueryClass: (value: '' | 'keyword/factoid' | 'concept/explanation' | 'comparison' | 'multi-hop' | 'chapter/doc constrained' | 'out-of-domain') => void;
    onToggleWebCorrection: () => void;
    onToggleDebug: () => void;
    onSearch: () => void;
}

export default function TestRetrievalPanel({
    testQuery,
    testTopK,
    testLatency,
    testLoading,
    testResults,
    testDebug,
    activeIndexVersion,
    testProfile,
    forceQueryClass,
    allowWebCorrection,
    retrievalPlan,
    retrievalTrace,
    retrievalConfidence,
    fallbackReason,
    evidenceSpans,
    onChangeQuery,
    onChangeTopK,
    onChangeProfile,
    onChangeForceQueryClass,
    onToggleWebCorrection,
    onToggleDebug,
    onSearch,
}: TestRetrievalPanelProps) {
    return (
        <div className={`${styles['doc-list-section']} ${styles.retrievalSection}`}>
            <h4 className={styles['doc-list-title']}>
                <i className="fas fa-search" /> Test Retrieval
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
                <select
                    value={testProfile}
                    onChange={e => onChangeProfile(e.target.value as 'low-latency' | 'balanced' | 'high-recall')}
                    className={styles.retrievalTopKSelect}
                >
                    <option value="low-latency">Low latency</option>
                    <option value="balanced">Balanced</option>
                    <option value="high-recall">High recall</option>
                </select>
                <select
                    value={forceQueryClass}
                    onChange={e => onChangeForceQueryClass(e.target.value as '' | 'keyword/factoid' | 'concept/explanation' | 'comparison' | 'multi-hop' | 'chapter/doc constrained' | 'out-of-domain')}
                    className={styles.retrievalTopKSelect}
                >
                    <option value="">Auto class</option>
                    <option value="keyword/factoid">Keyword</option>
                    <option value="concept/explanation">Concept</option>
                    <option value="comparison">Comparison</option>
                    <option value="multi-hop">Multi-hop</option>
                    <option value="chapter/doc constrained">Doc constrained</option>
                    <option value="out-of-domain">Out of domain</option>
                </select>
                <button
                    onClick={onSearch}
                    disabled={testLoading || !testQuery.trim()}
                    className={styles.retrievalSearchBtn}
                >
                    {testLoading ? 'Searching...' : 'Search'}
                </button>
                <label className={styles.retrievalDebugToggle}>
                    <input type="checkbox" checked={testDebug} onChange={onToggleDebug} />
                    <span>Debug</span>
                </label>
                <label className={styles.retrievalDebugToggle}>
                    <input type="checkbox" checked={allowWebCorrection} onChange={onToggleWebCorrection} />
                    <span>Web correction</span>
                </label>
            </div>

            {testResults !== null && (
                <div>
                    <div className={styles.retrievalMeta}>
                        {testResults.length} result(s) in {testLatency ?? '-'}ms
                        {activeIndexVersion ? ` | index ${activeIndexVersion}` : ''}
                    </div>

                    {(retrievalPlan || retrievalConfidence || fallbackReason) && (
                        <div className={styles.retrievalSummaryGrid}>
                            <div className={styles.retrievalSummaryCard}>
                                <div className={styles.retrievalSummaryLabel}>Plan</div>
                                <div className={styles.retrievalSummaryValue}>
                                    {retrievalPlan?.query_class || 'auto'} · {retrievalPlan?.retrieval_profile || testProfile}
                                </div>
                                {retrievalPlan?.decomposed_queries?.length ? (
                                    <div className={styles.retrievalSummarySub}>
                                        {retrievalPlan.decomposed_queries.join(' | ')}
                                    </div>
                                ) : null}
                            </div>
                            <div className={styles.retrievalSummaryCard}>
                                <div className={styles.retrievalSummaryLabel}>Confidence</div>
                                <div className={styles.retrievalSummaryValue}>
                                    {retrievalConfidence?.label || 'unknown'}
                                    {typeof retrievalConfidence?.score === 'number' ? ` · ${retrievalConfidence.score.toFixed(3)}` : ''}
                                </div>
                                <div className={styles.retrievalSummarySub}>
                                    coverage {typeof retrievalConfidence?.coverage === 'number' ? retrievalConfidence.coverage.toFixed(2) : '-'}
                                    {' · '}
                                    agreement {typeof retrievalConfidence?.source_agreement === 'number' ? retrievalConfidence.source_agreement.toFixed(2) : '-'}
                                </div>
                            </div>
                            <div className={styles.retrievalSummaryCard}>
                                <div className={styles.retrievalSummaryLabel}>Fallback</div>
                                <div className={styles.retrievalSummaryValue}>{fallbackReason || 'none'}</div>
                                <div className={styles.retrievalSummarySub}>{evidenceSpans.length} evidence span(s)</div>
                            </div>
                        </div>
                    )}

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
                                    {testDebug && (
                                        <div className={styles.retrievalDebugMeta}>
                                            <span>{r.node_type || 'leaf_chunk'}</span>
                                            {r.heading_path && <span>{r.heading_path}</span>}
                                            {typeof r.page_start === 'number' && r.page_start > 0 && (
                                                <span>
                                                    p.{r.page_start}
                                                    {r.page_end && r.page_end !== r.page_start ? `-${r.page_end}` : ''}
                                                </span>
                                            )}
                                            {r.parser_used && <span>{r.parser_used}</span>}
                                            {typeof r.retrieval_score === 'number' && <span>retrieval {r.retrieval_score.toFixed(4)}</span>}
                                            {typeof r.rerank_score === 'number' && <span>rerank {r.rerank_score.toFixed(4)}</span>}
                                            {r.retrieval_sources?.length ? <span>{r.retrieval_sources.join(', ')}</span> : null}
                                        </div>
                                    )}
                                    <div className={styles.retrievalResultText}>{r.text}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {testDebug && retrievalTrace.length > 0 && (
                        <div className={styles.retrievalTracePanel}>
                            <div className={styles.retrievalTraceTitle}>Retrieval Trace</div>
                            <div className={styles.retrievalTraceList}>
                                {retrievalTrace.map((item, idx) => (
                                    <div key={`${item.stage}_${idx}`} className={styles.retrievalTraceRow}>
                                        <span className={styles.retrievalTraceStage}>{item.stage}</span>
                                        <span className={styles.retrievalTraceMeta}>
                                            {typeof item.count === 'number'
                                                ? `${item.count} items`
                                                : item.query || (item.queries?.join(' | ') ?? '')}
                                        </span>
                                        {typeof item.latency_ms === 'number' && (
                                            <span className={styles.retrievalTraceMeta}>{item.latency_ms.toFixed(1)} ms</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
