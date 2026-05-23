import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { fileCenterApi, type FileAsset } from '@/api/fileCenterApi';
import styles from '../styles/AdminDashboard.module.css';

type Filters = {
    fileType: string;
    status: string;
    ownerType: string;
    courseId: string;
    keyword: string;
};

const FILE_TYPES = ['', 'chat_attachment', 'submission_pdf', 'knowledge_source', 'knowledge_vectorstore'];
const STATUSES = ['', 'active', 'soft_deleted', 'hard_deleted'];
const OWNER_TYPES = ['', 'chat_message', 'submission_document', 'knowledge_document', 'course'];

function formatBytes(num: number): string {
    const n = Number(num || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function FileCenterPanel() {
    const [loading, setLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
    const [auditLoading, setAuditLoading] = useState(false);
    const [error, setError] = useState('');

    const [filters, setFilters] = useState<Filters>({
        fileType: '',
        status: '',
        ownerType: '',
        courseId: '',
        keyword: '',
    });

    const [assets, setAssets] = useState<FileAsset[]>([]);
    const [total, setTotal] = useState(0);
    const [rows, setRows] = useState<Array<{ file_type: string; status: string; count: number; total_size: number }>>([]);
    const [audit, setAudit] = useState<{ counts?: { orphan_disk_files: number; dangling_registry: number } } | null>(null);

    const fetchAssets = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await fileCenterApi.listAssets({
                file_type: filters.fileType,
                status: filters.status,
                owner_type: filters.ownerType,
                course_id: filters.courseId,
                q: filters.keyword,
                limit: 120,
                skip: 0,
            });
            setAssets(data.assets || []);
            setTotal(Number(data.total || 0));
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to load file assets');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const data = await fileCenterApi.getStats();
            setRows(data.rows || []);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const fetchAudit = useCallback(async () => {
        setAuditLoading(true);
        try {
            const data = await fileCenterApi.getAudit();
            setAudit(data);
        } finally {
            setAuditLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    useEffect(() => {
        fetchStats();
        fetchAudit();
    }, [fetchStats, fetchAudit]);

    const totalSize = useMemo(
        () => assets.reduce((sum, a) => sum + Number(a.size || 0), 0),
        [assets],
    );

    const runAction = async (action: 'soft' | 'restore' | 'hard', fileId: string) => {
        const ok = window.confirm(
            action === 'hard'
                ? 'Hard delete will remove registry record state and try deleting file from disk. Continue?'
                : action === 'soft'
                    ? 'Mark this file as soft deleted?'
                    : 'Restore this file to active status?'
        );
        if (!ok) return;

        try {
            if (action === 'soft') {
                await fileCenterApi.softDelete(fileId, 'Admin file center operation');
            } else if (action === 'restore') {
                await fileCenterApi.restore(fileId);
            } else {
                await fileCenterApi.hardDelete(fileId);
            }
            await Promise.all([fetchAssets(), fetchStats(), fetchAudit()]);
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'Operation failed');
        }
    };

    return (
        <div>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <h2>File Center</h2>
                    <p>Manage chat attachments, submissions, and knowledge files on this server.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btnAdd} type="button" onClick={() => { void fetchAssets(); void fetchStats(); void fetchAudit(); }}>
                        <i className="fas fa-sync-alt" /> Refresh
                    </button>
                </div>
            </div>

            <div className={styles.statsGrid} style={{ marginBottom: 20 }}>
                <div className={styles.statCard}>
                    <div className={styles.statInfo}><h3>Listed Assets</h3><div className={styles.count}>{total}</div></div>
                    <div className={styles.statIcon}><i className="fas fa-folder-open" /></div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statInfo}><h3>Listed Size</h3><div className={styles.count}>{formatBytes(totalSize)}</div></div>
                    <div className={styles.statIcon}><i className="fas fa-hdd" /></div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statInfo}><h3>Orphan Files</h3><div className={styles.count}>{audit?.counts?.orphan_disk_files ?? '-'}</div></div>
                    <div className={styles.statIcon}><i className="fas fa-unlink" /></div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statInfo}><h3>Dangling Registry</h3><div className={styles.count}>{audit?.counts?.dangling_registry ?? '-'}</div></div>
                    <div className={styles.statIcon}><i className="fas fa-exclamation-triangle" /></div>
                </div>
            </div>

            <div className={styles.dashboardHeader} style={{ marginBottom: 12 }}>
                <div className={styles.headerActions} style={{ flexWrap: 'wrap' }}>
                    <select className={styles.searchInput} value={filters.fileType} onChange={(e) => setFilters((p) => ({ ...p, fileType: e.target.value }))}>
                        {FILE_TYPES.map((v) => <option key={v} value={v}>{v || 'All file types'}</option>)}
                    </select>
                    <select className={styles.searchInput} value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                        {STATUSES.map((v) => <option key={v} value={v}>{v || 'All statuses'}</option>)}
                    </select>
                    <select className={styles.searchInput} value={filters.ownerType} onChange={(e) => setFilters((p) => ({ ...p, ownerType: e.target.value }))}>
                        {OWNER_TYPES.map((v) => <option key={v} value={v}>{v || 'All owner types'}</option>)}
                    </select>
                    <input
                        className={styles.searchInput}
                        placeholder="Course ID"
                        value={filters.courseId}
                        onChange={(e) => setFilters((p) => ({ ...p, courseId: e.target.value }))}
                    />
                    <input
                        className={styles.searchInput}
                        placeholder="Keyword"
                        value={filters.keyword}
                        onChange={(e) => setFilters((p) => ({ ...p, keyword: e.target.value }))}
                    />
                    <button className={styles.btnAdd} type="button" onClick={() => void fetchAssets()}>Apply</button>
                </div>
            </div>

            {error && <div style={{ color: '#b42318', marginBottom: 10 }}>{error}</div>}

            <div className={styles.tableResponsive}>
                <table className={styles.customTable}>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Name</th>
                            <th>Storage Path</th>
                            <th>Size</th>
                            <th>Owner</th>
                            <th>Exists</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8}>Loading...</td></tr>
                        ) : assets.length === 0 ? (
                            <tr><td colSpan={8}>No file assets found</td></tr>
                        ) : assets.map((a) => (
                            <tr key={a.file_id}>
                                <td>{a.file_type}</td>
                                <td>{a.status}</td>
                                <td>{a.filename || '-'}</td>
                                <td title={a.storage_path}>{a.storage_path}</td>
                                <td>{formatBytes(a.size)}</td>
                                <td>{a.owner_type}:{a.owner_id}</td>
                                <td>{a.exists_on_disk ? 'yes' : 'no'}</td>
                                <td style={{ display: 'flex', gap: 8 }}>
                                    {a.status !== 'soft_deleted' && a.status !== 'hard_deleted' && (
                                        <button type="button" className={styles.btnAdd} onClick={() => void runAction('soft', a.file_id)}>Soft Delete</button>
                                    )}
                                    {a.status === 'soft_deleted' && (
                                        <button type="button" className={styles.btnAdd} onClick={() => void runAction('restore', a.file_id)}>Restore</button>
                                    )}
                                    {a.status !== 'hard_deleted' && (
                                        <button type="button" className={styles.btnAdd} onClick={() => void runAction('hard', a.file_id)}>Hard Delete</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 8 }}>Registry Stats</h3>
                {statsLoading ? <div>Loading stats...</div> : (
                    <div className={styles.tableResponsive}>
                        <table className={styles.customTable}>
                            <thead>
                                <tr>
                                    <th>File Type</th>
                                    <th>Status</th>
                                    <th>Count</th>
                                    <th>Total Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr><td colSpan={4}>No stats</td></tr>
                                ) : rows.map((r, idx) => (
                                    <tr key={`${r.file_type}-${r.status}-${idx}`}>
                                        <td>{r.file_type}</td>
                                        <td>{r.status}</td>
                                        <td>{r.count}</td>
                                        <td>{formatBytes(r.total_size)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 8 }}>Audit Snapshot</h3>
                {auditLoading ? <div>Running audit...</div> : (
                    <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        {JSON.stringify(audit ?? {}, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}
