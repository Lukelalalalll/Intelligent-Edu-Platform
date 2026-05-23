import React from 'react';
import type { AIFileGroup, FileAsset } from '@/api/fileCenterApi';
import styles from '../styles/AdminFileCenter.module.css';
import { formatBytes, statusClass } from './fileCenterHelpers';

type Props = {
    busy: boolean;
    groupBy: 'day' | 'month';
    onGroupByChange: (value: 'day' | 'month') => void;
    userGroups: AIFileGroup[];
    runAction: (asset: FileAsset, action: 'soft' | 'restore' | 'hard') => Promise<void>;
};

export default function UserGroupsSection({
    busy,
    groupBy,
    onGroupByChange,
    userGroups,
    runAction,
}: Props) {
    return (
        <div>
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <span className={styles.pathText}>Date Grouping</span>
                    <button
                        type="button"
                        className={`${styles.btn} ${groupBy === 'day' ? styles.btnPrimary : ''}`}
                        onClick={() => onGroupByChange('day')}
                    >
                        Day
                    </button>
                    <button
                        type="button"
                        className={`${styles.btn} ${groupBy === 'month' ? styles.btnPrimary : ''}`}
                        onClick={() => onGroupByChange('month')}
                    >
                        Month
                    </button>
                </div>
            </div>

            {busy && <div className={styles.empty}>Loading...</div>}
            {!busy && userGroups.length === 0 && <div className={styles.empty}>No AI chat files found for this user.</div>}

            {!busy && userGroups.map((group) => (
                <div key={group.date} className={styles.dateGroup}>
                    <div className={styles.dateHeader}>
                        <strong>{group.date}</strong>
                        <span className={styles.muted}>{group.count} files • {formatBytes(group.total_size)}</span>
                    </div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Name</th>
                                    <th>Session</th>
                                    <th>Type</th>
                                    <th>Size</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.items.map((asset) => (
                                    <tr key={asset.file_id}>
                                        <td className={statusClass(asset.status)}>{asset.status}</td>
                                        <td>{asset.filename || asset.file_id}</td>
                                        <td>{asset.session_id || '-'}</td>
                                        <td>{asset.file_type}</td>
                                        <td>{formatBytes(asset.size)}</td>
                                        <td>
                                            <div className={styles.actions}>
                                                {asset.status === 'active' && (
                                                    <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'soft')}>
                                                        Soft Delete
                                                    </button>
                                                )}
                                                {asset.status === 'soft_deleted' && (
                                                    <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'restore')}>
                                                        Restore
                                                    </button>
                                                )}
                                                {asset.status !== 'hard_deleted' && (
                                                    <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'hard')}>
                                                        Hard Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
