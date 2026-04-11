import styles from '../../styles/LlmMonitorPanel.module.css';

export function formatNumber(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

export function formatMs(ms: number): string {
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return Math.round(ms) + 'ms';
}

export function formatCost(val: number): string {
    if (!val) return '$0.00';
    return '$' + val.toFixed(4);
}
