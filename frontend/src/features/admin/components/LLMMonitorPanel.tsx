import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from '../styles/LlmMonitorPanel.module.css';
import client from '../../../api/client';
import { formatNumber, formatMs, formatCost } from './llm-monitor/formatters';
import MiniBarChart from './llm-monitor/MiniBarChart';
import BreakdownTable from './llm-monitor/BreakdownTable';
import ErrorLogTable from './llm-monitor/ErrorLogTable';

const PERIOD_OPTIONS = [
    { label: '1h', hours: 1 },
    { label: '6h', hours: 6 },
    { label: '24h', hours: 24 },
    { label: '7d', hours: 168 },
    { label: '30d', hours: 720 },
];

export default function LLMMonitorPanel() {
    const [hours, setHours] = useState(24);
    const [groupBy, setGroupBy] = useState('provider');
    const [tab, setTab] = useState('overview'); // overview | breakdown | errors

    const [stats, setStats] = useState(null);
    const [timeseries, setTimeseries] = useState([]);
    const [breakdown, setBreakdown] = useState([]);
    const [costData, setCostData] = useState(null);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(false);

    const autoRefreshRef = useRef(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const getBucket = () => {
        if (hours <= 6) return 15;
        if (hours <= 24) return 60;
        return 360;
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, tsRes, bdRes, costRes, errRes] = await Promise.all([
                client.get('/admin/telemetry/stats', { params: { hours } }),
                client.get('/admin/telemetry/timeseries', { params: { hours, bucket: getBucket() } }),
                client.get('/admin/telemetry/breakdown', { params: { hours, group_by: groupBy } }),
                client.get('/admin/telemetry/cost', { params: { hours } }),
                client.get('/admin/telemetry/errors', { params: { limit: 30 } }),
            ]);
            setStats(statsRes.data);
            setTimeseries(tsRes.data?.timeseries || []);
            setBreakdown(bdRes.data?.breakdown || []);
            setCostData(costRes.data);
            setErrors(errRes.data?.errors || []);
        } catch (err) {
            console.error('Telemetry fetch error', err);
        } finally {
            setLoading(false);
        }
    }, [hours, groupBy]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        if (autoRefresh) {
            autoRefreshRef.current = setInterval(fetchAll, 30000);
        }
        return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
    }, [autoRefresh, fetchAll]);

    // KPI totals
    interface ProviderStat {
        total_calls?: number;
        failed_calls?: number;
        avg_latency_ms?: number;
        success_rate_pct?: number;
        p50_latency_ms?: number;
        p95_latency_ms?: number;
        total_tokens?: number;
        total_cost?: number;
        [key: string]: unknown;
    }
    const providers: Record<string, ProviderStat> = stats?.providers || {};
    const totalCalls = Object.values(providers).reduce((s, p) => s + (p.total_calls || 0), 0);
    const totalErrors = Object.values(providers).reduce((s, p) => s + (p.failed_calls || 0), 0);
    const avgLatency = totalCalls ? Object.values(providers).reduce((s, p) => s + (p.avg_latency_ms || 0) * (p.total_calls || 0), 0) / totalCalls : 0;
    const totalCost = costData?.total_cost || 0;

    return (
        <div className={styles.llmMonitorPanel}>
            {/* Toolbar */}
            <div className={styles.monitorToolbar}>
                <div className={styles.periodPicker}>
                    {PERIOD_OPTIONS.map(opt => (
                        <button key={opt.hours}
                            className={`${styles.periodBtn} ${hours === opt.hours ? styles.periodBtnActive : ''}`}
                            onClick={() => setHours(opt.hours)}
                        >{opt.label}</button>
                    ))}
                </div>
                <div className={styles.toolbarRight}>
                    <label className={styles.autoRefreshToggle}>
                        <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
                        Auto-refresh
                    </label>
                    <button className={styles.refreshBtn} onClick={fetchAll} disabled={loading}>
                        {loading ? '⟳' : '↻'} Refresh
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
                <div className={`${styles.kpiCard} ${styles.kpiCalls}`}>
                    <div className={styles.kpiValue}>{formatNumber(totalCalls)}</div>
                    <div className={styles.kpiLabel}>Total Calls</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiErrors}`}>
                    <div className={styles.kpiValue}>{totalErrors}</div>
                    <div className={styles.kpiLabel}>Errors</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiLatency}`}>
                    <div className={styles.kpiValue}>{formatMs(avgLatency)}</div>
                    <div className={styles.kpiLabel}>Avg Latency</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiCost}`}>
                    <div className={styles.kpiValue}>{formatCost(totalCost)}</div>
                    <div className={styles.kpiLabel}>Est. Cost</div>
                </div>
            </div>

            {/* Charts */}
            <div className={styles.chartsRow}>
                <MiniBarChart data={timeseries} valueKey="calls" label="Calls" color="#6366f1" />
                <MiniBarChart data={timeseries} valueKey="avg_latency" label="Latency (ms)" color="#f59e0b" />
                <MiniBarChart data={timeseries} valueKey="errors" label="Errors" color="#ef4444" />
            </div>

            {/* Tabs */}
            <div className={styles.monitorTabs}>
                {['overview', 'breakdown', 'errors'].map(t => (
                    <button key={t}
                        className={`${styles.monitorTab} ${tab === t ? styles.monitorTabActive : ''}`}
                        onClick={() => setTab(t)}
                    >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
                {tab === 'breakdown' && (
                    <select className={styles.groupBySelect} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                        <option value="provider">Provider</option>
                        <option value="model">Model</option>
                        <option value="endpoint">Endpoint</option>
                        <option value="api_type">API Type</option>
                        <option value="error_code">Error Code</option>
                    </select>
                )}
            </div>

            {/* Tab Content */}
            <div className={styles.monitorContent}>
                {tab === 'overview' && (
                    <div className={styles.overviewGrid}>
                        {Object.entries(providers).map(([name, p]) => (
                            <div key={name} className={styles.providerCard}>
                                <h4 className={styles.providerName}>{name}</h4>
                                <div className={styles.providerStats}>
                                    <span>Calls: <strong>{p.total_calls}</strong></span>
                                    <span>Success: <strong>{p.success_rate_pct}%</strong></span>
                                    <span>P50: <strong>{formatMs(p.p50_latency_ms)}</strong></span>
                                    <span>P95: <strong>{formatMs(p.p95_latency_ms)}</strong></span>
                                    <span>Tokens: <strong>{formatNumber(p.total_tokens)}</strong></span>
                                    <span>Cost: <strong>{formatCost(p.total_cost)}</strong></span>
                                </div>
                            </div>
                        ))}
                        {Object.keys(providers).length === 0 && <p className={styles.noData}>No telemetry data for the selected period.</p>}
                    </div>
                )}
                {tab === 'breakdown' && <BreakdownTable data={breakdown} groupBy={groupBy} />}
                {tab === 'errors' && <ErrorLogTable errors={errors} />}
            </div>
        </div>
    );
}
