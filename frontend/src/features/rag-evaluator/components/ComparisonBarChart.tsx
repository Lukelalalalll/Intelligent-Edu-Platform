import React from 'react';
import styles from '../styles/RagEvaluator.module.css';

interface BarData {
    label: string;
    hybrid?: number;
    vector?: number;
    lowerIsBetter?: boolean;
}

interface Props {
    bars: BarData[];
}

export default function ComparisonBarChart({ bars }: Props) {
    return (
        <div className={styles.chartSection}>
            <h4 className={styles.chartTitle}>
                <i className="fas fa-chart-bar" style={{ marginRight: 8 }} />
                Metrics Comparison
            </h4>
            {bars.map(bar => (
                <div key={bar.label} className={styles.barGroup}>
                    <div className={styles.barLabel}>
                        {bar.label}
                        {bar.lowerIsBetter && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>↓ lower is better</span>}
                    </div>
                    {bar.hybrid !== undefined && (
                        <div className={styles.barRow}>
                            <span className={styles.barModeLabel}>Hybrid</span>
                            <div className={styles.barTrack}>
                                <div
                                    className={`${styles.barFill} ${styles.barFillHybrid}`}
                                    style={{ width: `${Math.min(bar.hybrid * 100, 100)}%` }}
                                />
                            </div>
                            <span className={styles.barPct}>{(bar.hybrid * 100).toFixed(1)}%</span>
                        </div>
                    )}
                    {bar.vector !== undefined && (
                        <div className={styles.barRow}>
                            <span className={styles.barModeLabel}>Vector</span>
                            <div className={styles.barTrack}>
                                <div
                                    className={`${styles.barFill} ${styles.barFillVector}`}
                                    style={{ width: `${Math.min(bar.vector * 100, 100)}%` }}
                                />
                            </div>
                            <span className={styles.barPct}>{(bar.vector * 100).toFixed(1)}%</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
