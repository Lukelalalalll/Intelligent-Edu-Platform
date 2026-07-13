import React from 'react';
import styles from '../../styles/LlmMonitorPanel.module.css';

interface MiniBarChartProps {
    data: Array<Record<string, any>>;
    valueKey: string;
    label: string;
    color?: string;
}

export default function MiniBarChart({ data, valueKey, label, color = '#6366f1' }: MiniBarChartProps) {
    if (!data?.length) return <div className={styles.miniChartEmpty}>No data</div>;
    const values = data.map(d => d[valueKey] || 0);
    const max = Math.max(...values, 1);
    return (
        <div className={styles.miniChart}>
            <div className={styles.miniChartLabel}>{label}</div>
            <div className={styles.miniChartBars}>
                {values.map((v, i) => (
                    <div key={i} className={styles.miniBar} style={{ height: `${(v / max) * 100}%`, background: color }}
                        title={`${data[i].bucket ? new Date(data[i].bucket).toLocaleTimeString() : i}: ${v}`}
                    />
                ))}
            </div>
        </div>
    );
}
