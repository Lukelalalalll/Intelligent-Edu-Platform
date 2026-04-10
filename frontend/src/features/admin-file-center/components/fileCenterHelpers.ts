import styles from '../styles/AdminFileCenter.module.css';

export function formatBytes(num: number): string {
    const n = Number(num || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function statusClass(status: string): string {
    if (status === 'soft_deleted') return styles.statusSoft;
    if (status === 'hard_deleted') return styles.statusHard;
    return styles.statusActive;
}

export function formatDateTime(value?: string): string {
    return String(value || '').replace('T', ' ').slice(0, 19);
}
