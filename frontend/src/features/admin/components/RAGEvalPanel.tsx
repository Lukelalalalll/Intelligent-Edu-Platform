import React, { useState, useEffect, useCallback } from 'react';
import styles from '../styles/AdminDashboard.module.css';
import client from '../../../api/client';
import * as api from '../../../api/ragEvalApi';
import type {
    DatasetSummary,
    Dataset,
    EvalRun,
    EvalResult,
    CompareResult,
    CaseTestResult,
} from '../../../api/ragEvalApi';

/* ── Tabs ──────────────────────────────────────────────────────── */
type Tab = 'overview' | 'datasets' | 'runs' | 'case-test' | 'compare';

export default function RAGEvalPanel() {
    const [tab, setTab] = useState<Tab>('overview');

    return (
        <div className={styles.llmMonitorPanel}>
            {/* Tab bar */}
            <div className={styles.monitorToolbar}>
                <div className={styles.monitorTabs}>
                    {(['overview', 'datasets', 'runs', 'case-test', 'compare'] as Tab[]).map(t => (
                        <button
                            key={t}
                            className={`${styles.monitorTab} ${tab === t ? styles.monitorTabActive : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {t === 'overview' && 'Overview'}
                            {t === 'datasets' && 'Datasets'}
                            {t === 'runs' && 'Runs'}
                            {t === 'case-test' && 'Case Test'}
                            {t === 'compare' && 'Compare'}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.monitorContent}>
                {tab === 'overview' && <OverviewTab />}
                {tab === 'datasets' && <DatasetsTab />}
                {tab === 'runs' && <RunsTab />}
                {tab === 'case-test' && <CaseTestTab />}
                {tab === 'compare' && <CompareTab />}
            </div>
        </div>
    );
}

/* ================================================================
   OVERVIEW TAB  — RAG telemetry stats + alerts
   ================================================================ */
interface RAGStats {
    period_hours: number;
    total: number;
    empty_retrieval_rate?: number;
    avg_latency_ms?: number;
    p50_latency_ms?: number;
    p95_latency_ms?: number;
    avg_result_count?: number;
    hybrid_pct?: number;
}
interface RAGAlert {
    rule: string;
    severity: string;
    message: string;
    value: number;
    threshold: number;
}

function OverviewTab() {
    const [hours, setHours] = useState(24);
    const [stats, setStats] = useState<RAGStats | null>(null);
    const [alerts, setAlerts] = useState<RAGAlert[]>([]);
    const [courseBreakdown, setCourseBreakdown] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, alertsRes, courseRes] = await Promise.all([
                client.get('/admin/rag-telemetry/stats', { params: { hours } }),
                client.get('/admin/rag-telemetry/alerts', { params: { hours: Math.min(hours, 24) } }),
                client.get('/admin/rag-telemetry/course-breakdown', { params: { hours } }),
            ]);
            setStats(statsRes.data);
            setAlerts(alertsRes.data?.alerts || []);
            setCourseBreakdown(courseRes.data?.breakdown || []);
        } catch (e) { console.error('RAG telemetry fetch error', e); }
        finally { setLoading(false); }
    }, [hours]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>RAG Retrieval Overview</h3>
                <div className={styles.periodPicker}>
                    {[{ label: '1h', h: 1 }, { label: '6h', h: 6 }, { label: '24h', h: 24 }, { label: '7d', h: 168 }].map(opt => (
                        <button
                            key={opt.h}
                            className={`${styles.periodBtn} ${hours === opt.h ? styles.periodBtnActive : ''}`}
                            onClick={() => setHours(opt.h)}
                        >{opt.label}</button>
                    ))}
                </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    {alerts.map((a, i) => (
                        <div key={i} style={{
                            background: a.severity === 'warning' ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)',
                            border: `1px solid ${a.severity === 'warning' ? '#fbbf24' : '#f87171'}`,
                            borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 13,
                        }}>
                            <strong style={{ color: a.severity === 'warning' ? '#fbbf24' : '#f87171' }}>
                                <i className={`fas fa-exclamation-triangle`} style={{ marginRight: 6 }}></i>
                                {a.rule}
                            </strong>: {a.message}
                        </div>
                    ))}
                </div>
            )}

            {/* KPI cards */}
            {loading && <p>Loading…</p>}
            {stats && stats.total > 0 && (
                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Total Queries</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Empty Rate</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{((stats.empty_retrieval_rate || 0) * 100).toFixed(1)}%</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Avg Latency</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.avg_latency_ms?.toFixed(0)} ms</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>P50 Latency</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.p50_latency_ms?.toFixed(0)} ms</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>P95 Latency</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.p95_latency_ms?.toFixed(0)} ms</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>Hybrid %</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.hybrid_pct?.toFixed(0)}%</div>
                    </div>
                </div>
            )}
            {stats && stats.total === 0 && <p style={{ opacity: 0.6 }}>No RAG queries recorded in this period.</p>}

            {/* Course breakdown */}
            {courseBreakdown.length > 0 && (
                <>
                    <h4 style={{ marginTop: 20, marginBottom: 8 }}>Per-Course Breakdown</h4>
                    <table className={styles.dataTable} style={{ width: '100%', fontSize: 13 }}>
                        <thead><tr><th>Course</th><th>Queries</th><th>Empty</th><th>Empty Rate</th><th>Avg Latency</th></tr></thead>
                        <tbody>
                            {courseBreakdown.map((c: any) => (
                                <tr key={c.course_id}>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.course_id}</td>
                                    <td>{c.total}</td>
                                    <td>{c.empty_count}</td>
                                    <td>{(c.empty_rate * 100).toFixed(1)}%</td>
                                    <td>{c.avg_latency_ms} ms</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
}

/* ================================================================
   DATASETS TAB
   ================================================================ */
function DatasetsTab() {
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedDs, setSelectedDs] = useState<Dataset | null>(null);

    const fetchDatasets = useCallback(async () => {
        setLoading(true);
        try {
            setDatasets(await api.listDatasets());
        } catch (e) { console.error('Failed to fetch datasets', e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this dataset?')) return;
        await api.deleteDataset(id);
        fetchDatasets();
    };

    const handleView = async (id: string) => {
        try {
            const ds = await api.getDataset(id);
            setSelectedDs(ds);
        } catch (e) { console.error('Failed to fetch dataset', e); }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Evaluation Datasets</h3>
                <button className={styles.btnPrimary} onClick={() => setShowCreate(!showCreate)}>
                    <i className="fas fa-plus" style={{ marginRight: 6 }}></i>
                    {showCreate ? 'Cancel' : 'New Dataset'}
                </button>
            </div>

            {showCreate && <CreateDatasetForm onCreated={() => { setShowCreate(false); fetchDatasets(); }} />}

            {loading && <p>Loading…</p>}

            <table className={styles.dataTable} style={{ width: '100%' }}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Cases</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {datasets.map(ds => (
                        <tr key={ds.dataset_id}>
                            <td>{ds.name}</td>
                            <td>{ds.description || '—'}</td>
                            <td>{ds.case_count}</td>
                            <td>{new Date(ds.created_at).toLocaleString()}</td>
                            <td>
                                <button className={styles.btnSecondary} onClick={() => handleView(ds.dataset_id)} style={{ marginRight: 4 }}>View</button>
                                <button className={styles.btnDanger || styles.btnSecondary} onClick={() => handleDelete(ds.dataset_id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                    {!loading && datasets.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, opacity: 0.6 }}>No datasets yet</td></tr>
                    )}
                </tbody>
            </table>

            {/* Dataset detail modal */}
            {selectedDs && (
                <div className={styles.modalOverlay} onClick={() => setSelectedDs(null)}>
                    <div className={styles.modalContent || ''} onClick={e => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-card, #1e1e2e)', borderRadius: 12, padding: 24 }}>
                        <h3>{selectedDs.name} — {selectedDs.case_count} cases</h3>
                        <table className={styles.dataTable} style={{ width: '100%', fontSize: 13 }}>
                            <thead><tr><th>#</th><th>Query</th><th>Expected Docs</th></tr></thead>
                            <tbody>
                                {selectedDs.cases.map((c, i) => (
                                    <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td>{c.query}</td>
                                        <td>{c.expected_doc_names?.join(', ') || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button className={styles.btnSecondary} onClick={() => setSelectedDs(null)} style={{ marginTop: 12 }}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Create Dataset Form ──────────────────────────────────────── */
function CreateDatasetForm({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [casesText, setCasesText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        const trimmed = name.trim();
        if (!trimmed) { setError('Name is required'); return; }

        let parsed: any[];
        try {
            parsed = JSON.parse(casesText);
            if (!Array.isArray(parsed) || parsed.length === 0) throw new Error();
        } catch {
            setError('Cases must be a non-empty JSON array. Example:\n[{"query":"What is X?","expected_doc_names":["doc1.pdf"]}]');
            return;
        }

        setSaving(true);
        try {
            await api.createDataset(trimmed, parsed, desc.trim());
            onCreated();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to create dataset');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ background: 'var(--bg-elevated, #2a2a3e)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <input className={styles.formInput} placeholder="Dataset name" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
                <input className={styles.formInput} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={{ flex: 2 }} />
            </div>
            <textarea
                className={styles.formInput}
                placeholder={'[\n  { "query": "What is photosynthesis?", "expected_doc_names": ["biology.pdf"] },\n  { "query": "Newton 3rd law",          "expected_doc_names": ["physics.pdf"] }\n]'}
                value={casesText}
                onChange={e => setCasesText(e.target.value)}
                rows={6}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            />
            {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{error}</p>}
            <button className={styles.btnPrimary} onClick={handleSubmit} disabled={saving} style={{ marginTop: 8 }}>
                {saving ? 'Creating…' : 'Create Dataset'}
            </button>
        </div>
    );
}

/* ================================================================
   RUNS TAB
   ================================================================ */
function RunsTab() {
    const [runs, setRuns] = useState<EvalRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [selectedRun, setSelectedRun] = useState<(EvalRun & { results: EvalResult[] }) | null>(null);

    // Run form
    const [dsId, setDsId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [topK, setTopK] = useState(5);
    const [useHybrid, setUseHybrid] = useState(true);
    const [running, setRunning] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [r, d] = await Promise.all([api.listRuns(), api.listDatasets()]);
            setRuns(r);
            setDatasets(d);
        } catch (e) { console.error('Failed to fetch runs', e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleStartRun = async () => {
        if (!dsId || !courseId.trim()) return;
        setRunning(true);
        try {
            await api.startRun(dsId, courseId.trim(), { top_k: topK, use_hybrid: useHybrid });
            fetchAll();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Run failed');
        } finally { setRunning(false); }
    };

    const handleViewRun = async (runId: string) => {
        try {
            const r = await api.getRun(runId);
            setSelectedRun(r);
        } catch (e) { console.error(e); }
    };

    const handleSetBaseline = async (run: EvalRun) => {
        if (!confirm(`Set this run as baseline for course ${run.course_id}?`)) return;
        await api.setBaseline(run.run_id, run.course_id);
        alert('Baseline set');
    };

    return (
        <div>
            {/* New Run form */}
            <div style={{ background: 'var(--bg-elevated, #2a2a3e)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h4 style={{ marginTop: 0, marginBottom: 8 }}>Start Evaluation Run</h4>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className={styles.formInput} value={dsId} onChange={e => setDsId(e.target.value)} style={{ minWidth: 180 }}>
                        <option value="">Select dataset…</option>
                        {datasets.map(d => <option key={d.dataset_id} value={d.dataset_id}>{d.name} ({d.case_count})</option>)}
                    </select>
                    <input className={styles.formInput} placeholder="Course ID" value={courseId} onChange={e => setCourseId(e.target.value)} style={{ width: 200 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        top_k:
                        <select className={styles.formInput} value={topK} onChange={e => setTopK(+e.target.value)} style={{ width: 64 }}>
                            {[3, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <input type="checkbox" checked={useHybrid} onChange={e => setUseHybrid(e.target.checked)} />
                        Hybrid
                    </label>
                    <button className={styles.btnPrimary} onClick={handleStartRun} disabled={running || !dsId || !courseId.trim()}>
                        {running ? 'Running…' : 'Run Evaluation'}
                    </button>
                </div>
            </div>

            {/* KPI cards for the latest run */}
            {runs.length > 0 && <MetricsCards metrics={runs[0].metrics} label={`Latest: ${runs[0].dataset_name}`} />}

            {/* Runs table */}
            <h3 style={{ marginBottom: 8 }}>Run History</h3>
            {loading && <p>Loading…</p>}
            <table className={styles.dataTable} style={{ width: '100%', fontSize: 13 }}>
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
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.course_id}</td>
                            <td>{(r.metrics.hit_rate * 100).toFixed(1)}%</td>
                            <td>{r.metrics.mrr.toFixed(3)}</td>
                            <td>{(r.metrics.empty_retrieval_rate * 100).toFixed(1)}%</td>
                            <td>{r.metrics.p50_latency_ms}</td>
                            <td>{r.metrics.p95_latency_ms}</td>
                            <td>{new Date(r.started_at).toLocaleString()}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                                <button className={styles.btnSecondary} onClick={() => handleViewRun(r.run_id)} style={{ marginRight: 4 }}>Detail</button>
                                <button className={styles.btnSecondary} onClick={() => handleSetBaseline(r)} title="Set as baseline">Baseline</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Run detail modal */}
            {selectedRun && (
                <div className={styles.modalOverlay} onClick={() => setSelectedRun(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg-card, #1e1e2e)', borderRadius: 12, padding: 24, margin: '64px auto' }}>
                        <h3>Run Detail — {selectedRun.dataset_name}</h3>
                        <MetricsCards metrics={selectedRun.metrics} />

                        <h4 style={{ marginTop: 16 }}>Per-Query Results</h4>
                        <table className={styles.dataTable} style={{ width: '100%', fontSize: 12 }}>
                            <thead>
                                <tr><th>#</th><th>Query</th><th>Hit</th><th>Latency</th><th>Expected</th><th>Retrieved</th></tr>
                            </thead>
                            <tbody>
                                {selectedRun.results.map((res, i) => (
                                    <tr key={i} style={{ background: res.hit ? undefined : 'rgba(248,113,113,0.08)' }}>
                                        <td>{i + 1}</td>
                                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.query}</td>
                                        <td>{res.hit ? '✅' : '❌'}</td>
                                        <td>{res.latency_ms} ms</td>
                                        <td style={{ fontSize: 11 }}>{res.expected_doc_names.join(', ') || '—'}</td>
                                        <td style={{ fontSize: 11 }}>{res.retrieved_doc_names.join(', ') || '(empty)'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button className={styles.btnSecondary} onClick={() => setSelectedRun(null)} style={{ marginTop: 12 }}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ================================================================
   CASE TEST TAB
   ================================================================ */
function CaseTestTab() {
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
            const r = await api.caseTest(courseId.trim(), query.trim(), topK, useHybrid);
            setResult(r);
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Test failed');
        } finally { setTesting(false); }
    };

    return (
        <div>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Single Query Test</h3>
            <div style={{ background: 'var(--bg-elevated, #2a2a3e)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <input className={styles.formInput} placeholder="Course ID" value={courseId} onChange={e => setCourseId(e.target.value)} style={{ width: 200 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        top_k:
                        <select className={styles.formInput} value={topK} onChange={e => setTopK(+e.target.value)} style={{ width: 64 }}>
                            {[3, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <input type="checkbox" checked={useHybrid} onChange={e => setUseHybrid(e.target.checked)} />
                        Hybrid
                    </label>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <input
                        className={styles.formInput}
                        placeholder="Enter query to test…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleTest()}
                        style={{ flex: 1 }}
                    />
                    <button className={styles.btnPrimary} onClick={handleTest} disabled={testing || !courseId.trim() || !query.trim()}>
                        {testing ? 'Testing…' : 'Test'}
                    </button>
                </div>
            </div>

            {result && (
                <div>
                    <p style={{ fontSize: 13, opacity: 0.7 }}>
                        Latency: <strong>{result.latency_ms} ms</strong> · Results: <strong>{result.results.length}</strong> · Hybrid: {result.use_hybrid ? 'Yes' : 'No'}
                    </p>
                    <table className={styles.dataTable} style={{ width: '100%', fontSize: 12 }}>
                        <thead><tr><th>#</th><th>Doc</th><th>Score</th><th>Text (preview)</th></tr></thead>
                        <tbody>
                            {result.results.map((r: any, i: number) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>{r.doc_name || '—'}</td>
                                    <td>{typeof r.score === 'number' ? r.score.toFixed(3) : '—'}</td>
                                    <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text?.slice(0, 200) || '—'}</td>
                                </tr>
                            ))}
                            {result.results.length === 0 && (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, opacity: 0.6 }}>No results returned</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ================================================================
   COMPARE TAB
   ================================================================ */
function CompareTab() {
    const [runs, setRuns] = useState<EvalRun[]>([]);
    const [baseId, setBaseId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [result, setResult] = useState<CompareResult | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        api.listRuns(100).then(setRuns).catch(console.error);
    }, []);

    const handleCompare = async () => {
        if (!baseId || !targetId) return;
        setLoading(true);
        try {
            setResult(await api.compareRuns(baseId, targetId));
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Compare failed');
        } finally { setLoading(false); }
    };

    const runLabel = (r: EvalRun) =>
        `${r.dataset_name} / ${r.course_id.slice(0, 8)} — ${new Date(r.started_at).toLocaleDateString()}`;

    return (
        <div>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Compare Runs</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                <label style={{ fontSize: 13 }}>
                    Base:
                    <select className={styles.formInput} value={baseId} onChange={e => setBaseId(e.target.value)} style={{ marginLeft: 6, minWidth: 260 }}>
                        <option value="">Select base run…</option>
                        {runs.map(r => <option key={r.run_id} value={r.run_id}>{runLabel(r)}</option>)}
                    </select>
                </label>
                <label style={{ fontSize: 13 }}>
                    Target:
                    <select className={styles.formInput} value={targetId} onChange={e => setTargetId(e.target.value)} style={{ marginLeft: 6, minWidth: 260 }}>
                        <option value="">Select target run…</option>
                        {runs.map(r => <option key={r.run_id} value={r.run_id}>{runLabel(r)}</option>)}
                    </select>
                </label>
                <button className={styles.btnPrimary} onClick={handleCompare} disabled={loading || !baseId || !targetId}>
                    {loading ? 'Comparing…' : 'Compare'}
                </button>
            </div>

            {result && (
                <table className={styles.dataTable} style={{ width: '100%' }}>
                    <thead>
                        <tr><th>Metric</th><th>Base</th><th>Target</th><th>Delta</th><th>Change %</th></tr>
                    </thead>
                    <tbody>
                        {Object.entries(result.diff).map(([key, d]) => {
                            const isLatency = key.includes('latency');
                            // For latency, lower is better (green if negative); for other metrics, higher is better (green if positive)
                            const color = d.delta === 0 ? undefined : isLatency
                                ? (d.delta < 0 ? '#4ade80' : '#f87171')
                                : (d.delta > 0 ? '#4ade80' : '#f87171');
                            const isRate = key.includes('rate') || key === 'mrr';
                            const fmt = (v: number) => isRate ? `${(v * 100).toFixed(1)}%` : isLatency ? `${v.toFixed(1)} ms` : v.toFixed(3);
                            return (
                                <tr key={key}>
                                    <td style={{ fontWeight: 600 }}>{key}</td>
                                    <td>{fmt(d.base)}</td>
                                    <td>{fmt(d.target)}</td>
                                    <td style={{ color, fontWeight: 600 }}>{d.delta > 0 ? '+' : ''}{isRate ? `${(d.delta * 100).toFixed(1)}%` : d.delta.toFixed(2)}</td>
                                    <td style={{ color }}>{d.pct_change > 0 ? '+' : ''}{d.pct_change.toFixed(1)}%</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/* ================================================================
   SHARED — KPI metric cards
   ================================================================ */
function MetricsCards({ metrics, label }: { metrics: EvalRun['metrics']; label?: string }) {
    return (
        <div>
            {label && <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</p>}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Hit Rate</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{(metrics.hit_rate * 100).toFixed(1)}%</div>
                </div>
                <div className={styles.kpiCard}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>MRR</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{metrics.mrr.toFixed(3)}</div>
                </div>
                <div className={styles.kpiCard}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Empty Retrieval</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{(metrics.empty_retrieval_rate * 100).toFixed(1)}%</div>
                </div>
                <div className={styles.kpiCard}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>P50 Latency</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{metrics.p50_latency_ms} ms</div>
                </div>
                <div className={styles.kpiCard}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>P95 Latency</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{metrics.p95_latency_ms} ms</div>
                </div>
                <div className={styles.kpiCard}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Cases</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{metrics.case_count}</div>
                </div>
            </div>
        </div>
    );
}
