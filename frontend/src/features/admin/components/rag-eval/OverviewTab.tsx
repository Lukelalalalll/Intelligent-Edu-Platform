import React, { useCallback, useEffect, useState } from 'react';
import styles from '../../styles/RagEvalPanel.module.css';
import client from '../../../../api/client';
import { PERIOD_OPTIONS } from './constants';
import type { CourseBreakdownItem, RAGAlert, RAGStats } from './types';

export default function OverviewTab() {
    const [hours, setHours] = useState(24);
    const [stats, setStats] = useState<RAGStats | null>(null);
    const [alerts, setAlerts] = useState<RAGAlert[]>([]);
    const [courseBreakdown, setCourseBreakdown] = useState<CourseBreakdownItem[]>([]);
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
        } catch (e) {
            console.error('RAG telemetry fetch error', e);
        } finally {
            setLoading(false);
        }
    }, [hours]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    return (
        <div>
            <div className={styles.ragSectionHeader}>
                <h3 className={styles.ragSectionTitle}>RAG Retrieval Overview</h3>
                <div className={styles.periodPicker}>
                    {PERIOD_OPTIONS.map(opt => (
                        <button
                            key={opt.h}
                            className={`${styles.periodBtn} ${hours === opt.h ? styles.periodBtnActive : ''}`}
                            onClick={() => setHours(opt.h)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {alerts.length > 0 && (
                <div className={styles.ragAlertList}>
                    {alerts.map((a, i) => (
                        <div
                            key={`${a.rule}_${i}`}
                            className={`${styles.ragAlertBox} ${a.severity === 'warning' ? styles.ragAlertWarning : styles.ragAlertCritical}`}
                        >
                            <strong className={a.severity === 'warning' ? styles.ragAlertTitleWarning : styles.ragAlertTitleCritical}>
                                <i className={`fas fa-exclamation-triangle ${styles.ragAlertIcon}`}></i>
                                {a.rule}
                            </strong>
                            : {a.message}
                        </div>
                    ))}
                </div>
            )}

            {loading && <p>Loading...</p>}
            {stats && stats.total > 0 && (
                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <div className={styles.ragKpiLabel}>Total Queries</div>
                        <div className={styles.ragKpiValue}>{stats.total}</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.ragKpiLabel}>Empty Rate</div>
                        <div className={styles.ragKpiValue}>{((stats.empty_retrieval_rate || 0) * 100).toFixed(1)}%</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.ragKpiLabel}>Avg Latency</div>
                        <div className={styles.ragKpiValue}>{stats.avg_latency_ms?.toFixed(0)} ms</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.ragKpiLabel}>P50 Latency</div>
                        <div className={styles.ragKpiValue}>{stats.p50_latency_ms?.toFixed(0)} ms</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.ragKpiLabel}>P95 Latency</div>
                        <div className={styles.ragKpiValue}>{stats.p95_latency_ms?.toFixed(0)} ms</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.ragKpiLabel}>Hybrid %</div>
                        <div className={styles.ragKpiValue}>{stats.hybrid_pct?.toFixed(0)}%</div>
                    </div>
                </div>
            )}
            {stats && stats.total === 0 && <p className={styles.ragMutedText}>No RAG queries recorded in this period.</p>}

            {courseBreakdown.length > 0 && (
                <>
                    <h4 className={styles.ragSubheading}>Per-Course Breakdown</h4>
                    <table className={`${styles.dataTable} ${styles.ragTableCompact}`}>
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th>Queries</th>
                                <th>Empty</th>
                                <th>Empty Rate</th>
                                <th>Avg Latency</th>
                            </tr>
                        </thead>
                        <tbody>
                            {courseBreakdown.map(c => (
                                <tr key={c.course_id}>
                                    <td className={styles.ragMonoCell}>{c.course_id}</td>
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
