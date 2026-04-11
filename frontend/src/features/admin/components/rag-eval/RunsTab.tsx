import React, { useCallback, useEffect, useState } from 'react';
import styles from '../../styles/RagEvalPanel.module.css';
import * as api from '../../../../api/ragEvalApi';
import type { DatasetSummary, EvalResult, EvalRun } from '../../../../api/ragEvalApi';
import { TOP_K_OPTIONS } from './constants';
import MetricsCards from './MetricsCards';

type SelectedRun = EvalRun & { results: EvalResult[] };

export default function RunsTab() {
    const [runs, setRuns] = useState<EvalRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);

    const [dsId, setDsId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [topK, setTopK] = useState(5);
    const [useHybrid, setUseHybrid] = useState(true);
    const [running, setRunning] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [runList, datasetList] = await Promise.all([api.listRuns(), api.listDatasets()]);
            setRuns(runList);
            setDatasets(datasetList);
        } catch (e) {
            console.error('Failed to fetch runs', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const handleStartRun = async () => {
        if (!dsId || !courseId.trim()) return;
        setRunning(true);
        try {
            await api.startRun(dsId, courseId.trim(), { top_k: topK, use_hybrid: useHybrid });
            fetchAll();
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            alert(message || 'Run failed');
        } finally {
            setRunning(false);
        }
    };

    const handleViewRun = async (runId: string) => {
        try {
            const run = await api.getRun(runId);
            setSelectedRun(run);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSetBaseline = async (run: EvalRun) => {
        if (!confirm(`Set this run as baseline for course ${run.course_id}?`)) return;
        await api.setBaseline(run.run_id, run.course_id);
        alert('Baseline set');
    };

    return (
        <div>
            <div className={styles.ragFormCard}>
                <h4 className={styles.ragFormTitle}>Start Evaluation Run</h4>
                <div className={styles.ragInlineFormRow}>
                    <select className={`${styles.formInput} ${styles.ragControlWide}`} value={dsId} onChange={e => setDsId(e.target.value)}>
                        <option value="">Select dataset...</option>
                        {datasets.map(d => (
                            <option key={d.dataset_id} value={d.dataset_id}>
                                {d.name} ({d.case_count})
                            </option>
                        ))}
                    </select>
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
                    <button className={styles.btnPrimary} onClick={handleStartRun} disabled={running || !dsId || !courseId.trim()}>
                        {running ? 'Running...' : 'Run Evaluation'}
                    </button>
                </div>
            </div>

            {runs.length > 0 && <MetricsCards metrics={runs[0].metrics} label={`Latest: ${runs[0].dataset_name}`} />}

            <h3 className={styles.ragSectionTitleSpaced}>Run History</h3>
            {loading && <p>Loading...</p>}
            <table className={`${styles.dataTable} ${styles.ragTableCompact}`}>
                <thead>
                    <tr>
                        <th>Dataset</th>
                        <th>Course</th>
                        <th>Hit Rate</th>
                        <th>MRR</th>
                        <th>Empty %</th>
                        <th>P50 ms</th>
                        <th>P95 ms</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map(r => (
                        <tr key={r.run_id}>
                            <td>{r.dataset_name}</td>
                            <td className={styles.ragMonoCell}>{r.course_id}</td>
                            <td>{(r.metrics.hit_rate * 100).toFixed(1)}%</td>
                            <td>{r.metrics.mrr.toFixed(3)}</td>
                            <td>{(r.metrics.empty_retrieval_rate * 100).toFixed(1)}%</td>
                            <td>{r.metrics.p50_latency_ms}</td>
                            <td>{r.metrics.p95_latency_ms}</td>
                            <td>{new Date(r.started_at).toLocaleString()}</td>
                            <td className={styles.ragNowrapCell}>
                                <button className={`${styles.btnSecondary} ${styles.ragButtonInlineGap}`} onClick={() => handleViewRun(r.run_id)}>
                                    Detail
                                </button>
                                <button className={styles.btnSecondary} onClick={() => handleSetBaseline(r)} title="Set as baseline">
                                    Baseline
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {selectedRun && (
                <div className={styles.modalOverlay} onClick={() => setSelectedRun(null)}>
                    <div
                        onClick={e => e.stopPropagation()}
                        className={styles.ragModalPanelLg}
                    >
                        <h3>Run Detail - {selectedRun.dataset_name}</h3>
                        <MetricsCards metrics={selectedRun.metrics} />

                        <h4 className={styles.ragSubheading}>Per-Query Results</h4>
                        <table className={`${styles.dataTable} ${styles.ragTableCompactSmall}`}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Query</th>
                                    <th>Hit</th>
                                    <th>Latency</th>
                                    <th>Expected</th>
                                    <th>Retrieved</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedRun.results.map((res, i) => (
                                    <tr key={i} className={res.hit ? '' : styles.ragMissRow}>
                                        <td>{i + 1}</td>
                                        <td className={styles.ragQueryEllipsisCell}>{res.query}</td>
                                        <td>{res.hit ? 'OK' : 'MISS'}</td>
                                        <td>{res.latency_ms} ms</td>
                                        <td className={styles.ragTinyCell}>{res.expected_doc_names.join(', ') || '-'}</td>
                                        <td className={styles.ragTinyCell}>{res.retrieved_doc_names.join(', ') || '(empty)'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button className={`${styles.btnSecondary} ${styles.ragModalCloseBtn}`} onClick={() => setSelectedRun(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
