import React from 'react';
import styles from '../../styles/LlmMonitorPanel.module.css';
import { formatNumber, formatMs, formatCost } from './formatters';

interface BreakdownRow {
    name?: string;
    calls?: number;
    errors?: number;
    avg_latency?: number;
    total_tokens?: number;
    total_cost?: number;
}

interface BreakdownTableProps {
    data: BreakdownRow[];
    groupBy: string;
}

export default function BreakdownTable({ data, groupBy }: BreakdownTableProps) {
    if (!data?.length) return <p className={styles.noData}>No data for this period.</p>;
    return (
        <table className={styles.adminTable}>
            <thead>
                <tr>
                    <th>{groupBy}</th>
                    <th>Calls</th>
                    <th>Errors</th>
                    <th>Avg Latency</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row, i) => (
                    <tr key={i}>
                        <td><strong>{row.name || '(empty)'}</strong></td>
                        <td>{formatNumber(row.calls)}</td>
                        <td className={row.errors > 0 ? styles.errorText : ''}>{row.errors}</td>
                        <td>{formatMs(row.avg_latency)}</td>
                        <td>{formatNumber(row.total_tokens)}</td>
                        <td>{formatCost(row.total_cost)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
