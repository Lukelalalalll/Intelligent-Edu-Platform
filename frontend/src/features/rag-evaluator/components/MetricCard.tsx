import React from 'react';
import styles from '../styles/RagEvaluator.module.css';

interface Props {
    label: string;
    hybridValue?: number;
    vectorValue?: number;
    delta?: number;
    isPercentage?: boolean;
    lowerIsBetter?: boolean;
}

export default function MetricCard({ label, hybridValue, vectorValue, delta, isPercentage = true, lowerIsBetter = false }: Props) {
    const format = (v: number | undefined) => {
        if (v === undefined) return '—';
        return isPercentage ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
    };

    const getDeltaClass = () => {
        if (delta === undefined || Math.abs(delta) < 0.005) return styles.deltaNeutral;
        const isGood = lowerIsBetter ? delta < 0 : delta > 0;
        return isGood ? styles.deltaPositive : styles.deltaNegative;
    };

    const formatDelta = () => {
        if (delta === undefined) return '';
        const pct = (delta * 100).toFixed(1);
        const sign = delta >= 0 ? '+' : '';
        return `${sign}${pct}%`;
    };

    return (
        <div className={styles.metricCard}>
            <div className={styles.metricLabel}>{label}</div>
            <div className={styles.metricValues}>
                {hybridValue !== undefined && (
                    <div className={styles.metricLine}>
                        <span className={styles.metricModeLabel}>Hybrid</span>
                        <span className={styles.metricNumber}>{format(hybridValue)}</span>
                    </div>
                )}
                {vectorValue !== undefined && (
                    <div className={styles.metricLine}>
                        <span className={styles.metricModeLabel}>Vector</span>
                        <span className={styles.metricNumber}>{format(vectorValue)}</span>
                    </div>
                )}
                {delta !== undefined && (
                    <div className={`${styles.metricDelta} ${getDeltaClass()}`}>
                        △ {formatDelta()} {Math.abs(delta) >= 0.005 ? (lowerIsBetter ? (delta < 0 ? '✅' : '⚠️') : (delta > 0 ? '✅' : '⚠️')) : ''}
                    </div>
                )}
            </div>
        </div>
    );
}
