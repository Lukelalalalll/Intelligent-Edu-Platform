import React from 'react';
import styles from '../../styles/AdminDashboard.module.css';

interface ErrorEntry {
    timestamp?: string;
    provider?: string;
    endpoint?: string;
    error_code?: string;
    error?: string;
}

interface ErrorLogTableProps {
    errors: ErrorEntry[];
}

export default function ErrorLogTable({ errors }: ErrorLogTableProps) {
    if (!errors?.length) return <p className={styles.noData}>No errors recorded.</p>;
    return (
        <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Provider</th>
                        <th>Endpoint</th>
                        <th>Category</th>
                        <th>Error</th>
                    </tr>
                </thead>
                <tbody>
                    {errors.map((e, i) => (
                        <tr key={i}>
                            <td style={{ whiteSpace: 'nowrap' }}>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '-'}</td>
                            <td>{e.provider}</td>
                            <td>{e.endpoint}</td>
                            <td><span className={`${styles.badge} ${styles['badge_' + e.error_code] || styles.badgeDefault}`}>{e.error_code || 'unknown'}</span></td>
                            <td className={styles.errorCell} title={e.error}>{(e.error || '').slice(0, 120)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
