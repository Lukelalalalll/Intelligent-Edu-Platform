import React, { useCallback } from 'react';
import styles from '../styles/RagEvaluator.module.css';
import MetricCard from './MetricCard';
import ComparisonBarChart from './ComparisonBarChart';
import QuestionDetailTable from './QuestionDetailTable';
import type { EvalABResult } from '../api/ragEvaluatorApi';

interface Props {
    results: EvalABResult | null;
    loading: boolean;
}

export default function StepResults({ results, loading }: Props) {
    const handleExportJSON = useCallback(() => {
        if (!results) return;
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rag-eval-${new Date().toISOString().slice(0, 19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [results]);

    const handleExportCSV = useCallback(() => {
        if (!results) return;
        const details = results.hybrid?.details || results.vector?.details || [];
        const hybridDetails = results.hybrid?.details;
        const vectorDetails = results.vector?.details;
        const isComparison = !!hybridDetails && !!vectorDetails;

        const headers = [
            '#',
            'Query',
            'Expected Docs',
            'Expected Keywords',
            ...(isComparison
                ? [
                    'Hybrid Hit',
                    'Hybrid Invalid',
                    'Hybrid Degenerate',
                    'Hybrid Retrieved',
                    'Hybrid Correct Citations',
                    'Hybrid Latency (ms)',
                    'Vector Hit',
                    'Vector Invalid',
                    'Vector Degenerate',
                    'Vector Retrieved',
                    'Vector Correct Citations',
                    'Vector Latency (ms)',
                ]
                : ['Hit', 'Invalid', 'Degenerate', 'Retrieved', 'Correct Citations', 'Latency (ms)']),
        ];
        const rows = details.map((d, i) => {
            const hd = hybridDetails?.[i];
            const vd = vectorDetails?.[i];
            const cols = [
                String(i + 1),
                `"${d.query.replace(/"/g, '""')}"`,
                `"${(d.expected_doc_names || []).join('; ').replace(/"/g, '""')}"`,
                `"${(d.expected_keywords || []).join('; ').replace(/"/g, '""')}"`,
                ...(isComparison
                    ? [
                        hd?.hit ? 'YES' : 'NO',
                        hd?.invalid ? 'YES' : 'NO',
                        hd?.degenerate ? 'YES' : 'NO',
                        String(hd?.retrieved_count ?? 0),
                        String(hd?.correct_citations ?? 0),
                        String(hd?.latency_ms ?? ''),
                        vd?.hit ? 'YES' : 'NO',
                        vd?.invalid ? 'YES' : 'NO',
                        vd?.degenerate ? 'YES' : 'NO',
                        String(vd?.retrieved_count ?? 0),
                        String(vd?.correct_citations ?? 0),
                        String(vd?.latency_ms ?? ''),
                    ]
                    : [
                        d.hit ? 'YES' : 'NO',
                        d.invalid ? 'YES' : 'NO',
                        d.degenerate ? 'YES' : 'NO',
                        String(d.retrieved_count),
                        String(d.correct_citations),
                        String(d.latency_ms ?? ''),
                    ]),
            ];
            return cols.join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rag-eval-${new Date().toISOString().slice(0, 19)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [results]);

    if (loading) {
        return (
            <div>
                <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: '100%' }} />
                </div>
                <p className={styles.loadingText}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Running evaluation across all test cases... This may take a moment.
                </p>
            </div>
        );
    }

    if (!results) {
        return (
            <div className={styles.datasetEmpty}>
                <i className="fas fa-chart-bar" style={{ fontSize: 32, marginBottom: 12, display: 'block', opacity: 0.3 }} />
                <p>No results yet. Configure your test and click "Run Evaluation" to start.</p>
            </div>
        );
    }

    const h = results.hybrid;
    const v = results.vector;
    const cmp = results.comparison;
    const isComparison = !!h && !!v;

    return (
        <div>
            {/* Export buttons */}
            <div className={styles.exportRow}>
                <button className={styles.btnSecondary} onClick={handleExportJSON}>
                    <i className="fas fa-download" style={{ marginRight: 6 }} />
                    Export JSON
                </button>
                <button className={styles.btnSecondary} onClick={handleExportCSV}>
                    <i className="fas fa-file-csv" style={{ marginRight: 6 }} />
                    Export CSV
                </button>
            </div>

            {/* Summary metric cards */}
            <div className={styles.metricsRow}>
                <MetricCard
                    label="Hit Rate"
                    hybridValue={h?.hit_rate}
                    vectorValue={v?.hit_rate}
                    delta={cmp?.hit_rate_delta}
                />
                <MetricCard
                    label="Citation Correct Rate"
                    hybridValue={h?.citation_correct_rate}
                    vectorValue={v?.citation_correct_rate}
                    delta={cmp?.citation_rate_delta}
                />
                <MetricCard
                    label="Empty Retrieval Rate"
                    hybridValue={h?.empty_retrieval_rate}
                    vectorValue={v?.empty_retrieval_rate}
                    delta={cmp?.empty_rate_delta}
                    lowerIsBetter
                />
                <MetricCard
                    label="MRR (Mean Reciprocal Rank)"
                    hybridValue={h?.mrr}
                    vectorValue={v?.mrr}
                    delta={cmp?.mrr_delta}
                />
            </div>

            {/* Bar chart */}
            {isComparison && (
                <ComparisonBarChart
                    bars={[
                        { label: 'Hit Rate', hybrid: h.hit_rate, vector: v.hit_rate },
                        { label: 'Citation Correct Rate', hybrid: h.citation_correct_rate, vector: v.citation_correct_rate },
                        { label: 'Empty Retrieval Rate', hybrid: h.empty_retrieval_rate, vector: v.empty_retrieval_rate, lowerIsBetter: true },
                        { label: 'MRR', hybrid: h.mrr ?? 0, vector: v.mrr ?? 0 },
                    ]}
                />
            )}

            {/* Single mode bar chart */}
            {!isComparison && (h || v) && (
                <ComparisonBarChart
                    bars={[
                        { label: 'Hit Rate', ...(h ? { hybrid: h.hit_rate } : { vector: v!.hit_rate }) },
                        { label: 'Citation Correct Rate', ...(h ? { hybrid: h.citation_correct_rate } : { vector: v!.citation_correct_rate }) },
                        { label: 'Empty Retrieval Rate', ...(h ? { hybrid: h.empty_retrieval_rate } : { vector: v!.empty_retrieval_rate }), lowerIsBetter: true },
                        { label: 'MRR', ...(h ? { hybrid: h.mrr ?? 0 } : { vector: v!.mrr ?? 0 }) },
                    ]}
                />
            )}

            {/* Counts summary */}
            {(h || v) && (
                <div className={styles.card}>
                    <h4 className={styles.cardTitle}>
                        <i className="fas fa-info-circle" style={{ marginRight: 8 }} />
                        Summary
                    </h4>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
                        {h && (
                            <div>
                                <strong>Hybrid:</strong> {h.counts.hit}/{h.evaluable_total ?? h.total} hits,{' '}
                                {h.counts.correct_citations}/{h.counts.total_citations} correct citations,{' '}
                                {h.counts.empty} empty, {h.counts.invalid ?? 0} invalid, {h.counts.degenerate ?? 0} no-criteria
                                {h.avg_latency_ms != null && <span> | Avg latency: {h.avg_latency_ms}ms (p95: {h.p95_latency_ms}ms)</span>}
                            </div>
                        )}
                        {v && (
                            <div>
                                <strong>Vector:</strong> {v.counts.hit}/{v.evaluable_total ?? v.total} hits,{' '}
                                {v.counts.correct_citations}/{v.counts.total_citations} correct citations,{' '}
                                {v.counts.empty} empty, {v.counts.invalid ?? 0} invalid, {v.counts.degenerate ?? 0} no-criteria
                                {v.avg_latency_ms != null && <span> | Avg latency: {v.avg_latency_ms}ms (p95: {v.p95_latency_ms}ms)</span>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Per-question detail table */}
            <h4 className={styles.cardTitle} style={{ marginTop: 24, marginBottom: 12 }}>
                <i className="fas fa-table" style={{ marginRight: 8 }} />
                Per-Question Results
            </h4>
            <QuestionDetailTable
                hybridDetails={h?.details}
                vectorDetails={v?.details}
                isComparison={isComparison}
            />
        </div>
    );
}
