import React from 'react';
import type { FileAsset } from '@/api/fileCenterApi';
import styles from '../styles/AdminFileCenter.module.css';
import { formatBytes, formatDateTime, statusClass } from './fileCenterHelpers';

type Props = {
    busy: boolean;
    roomAssets: FileAsset[];
    runAction: (asset: FileAsset, action: 'soft' | 'restore' | 'hard') => Promise<void>;
};

export default function GroupAssetsTable({ busy, roomAssets, runAction }: Props) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Created</th>
                        <th>Size</th>
                        <th>Path</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {busy ? (
                        <tr><td colSpan={7}>Loading...</td></tr>
                    ) : roomAssets.length === 0 ? (
                        <tr><td colSpan={7}>No files in this group chat.</td></tr>
                    ) : roomAssets.map((asset) => (
                        <tr key={asset.file_id}>
                            <td className={statusClass(asset.status)}>{asset.status}</td>
                            <td>{asset.filename || asset.file_id}</td>
                            <td>{asset.file_type}</td>
                            <td>{formatDateTime(asset.created_at)}</td>
                            <td>{formatBytes(asset.size)}</td>
                            <td>{asset.storage_path}</td>
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
                                    {asset.status !== 'hard_deleted' && (
                                        <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => window.open(`/api/admin/files/assets/${encodeURIComponent(asset.file_id)}/download`, '_blank')}>
                                            Download
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
