import React from 'react';
import styles from '../../styles/AdminDashboard.module.css';
import type { EvalMetrics } from '../../../../api/ragEvalApi';

interface MetricsCardsProps {
    metrics: EvalMetrics;
    label?: string;
}

export default function MetricsCards({ metrics, label }: MetricsCardsProps) {
    return (
        <div>
            {label && <p className={styles.ragMutedText}>{label}</p>}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.ragKpiLabel}>Hit Rate</div>
                    <div className={styles.ragKpiValue}>{(metrics.hit_rate * 100).toFixed(1)}%</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.ragKpiLabel}>MRR</div>
                    <div className={styles.ragKpiValue}>{metrics.mrr.toFixed(3)}</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.ragKpiLabel}>Empty Retrieval</div>
                    <div className={styles.ragKpiValue}>{(metrics.empty_retrieval_rate * 100).toFixed(1)}%</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.ragKpiLabel}>P50 Latency</div>
                    <div className={styles.ragKpiValue}>{metrics.p50_latency_ms} ms</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.ragKpiLabel}>P95 Latency</div>
                    <div className={styles.ragKpiValue}>{metrics.p95_latency_ms} ms</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.ragKpiLabel}>Cases</div>
                    <div className={styles.ragKpiValue}>{metrics.case_count}</div>
                </div>
            </div>
        </div>
    );
}
