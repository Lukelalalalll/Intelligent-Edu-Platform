import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { HistoryItem } from '../api/fileCenterHistoryApi';
import { fileCenterHistoryApi } from '../api/fileCenterHistoryApi';
import styles from '../styles/fileCenter.module.css';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import HistoryDetailModal from './HistoryDetailModal';

const TOOL_LABELS: Record<string, string> = {
    slides: 'PPT Generation',
    questions: 'Question Bank',
    image_extractor: 'Image Extraction',
    diagram: 'Diagram Generation',
    study_notes: 'Study Notes',
    video: 'Video Generation',
};

interface Props {
    tool: string;
    /** If provided, uses admin endpoints scoped to this user */
    adminUserId?: string;
    // onViewDetail is now handled internally
    /** Called after any deletion so parent can refresh summary counts */
    onDeleted?: () => void;
}

export default function ToolHistoryTab({ tool, adminUserId, onDeleted }: Props) {
    const isAdminMode = adminUserId !== undefined;
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{show: boolean, id?: string, batch?: boolean}>({show: false});
    const searchTimer = useRef<ReturnType<typeof setTimeout>>();
    const pageSize = 10;

    const load = useCallback(async (p: number, q: string) => {
        setLoading(true);
        try {
            const data = isAdminMode
                ? await fileCenterHistoryApi.adminGetHistory(tool, p, pageSize, adminUserId ?? '', q)
                : await fileCenterHistoryApi.getHistory(tool, p, pageSize, q);
            setItems(data.items);
            setTotal(data.total);
        } catch {
            toast.error('Failed to load history');
        } finally {
            setLoading(false);
        }
    }, [tool, adminUserId]);

    useEffect(() => {
        setPage(1);
        setSelected(new Set());
        load(1, search);
    }, [tool, adminUserId]);

    useEffect(() => { load(page, search); }, [page]);

    const handleSearch = (val: string) => {
        setSearch(val);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setPage(1);
            load(1, val);
        }, 400);
    };

    const handleDelete = async (id: string) => {
        setConfirmDelete({ show: true, id });
    };

    const confirmDeleteAction = async () => {
        if (!confirmDelete.id) return;
        try {
            const id = confirmDelete.id;
            if (isAdminMode) {
                await fileCenterHistoryApi.adminHardDelete(tool, id);
            } else {
                await fileCenterHistoryApi.softDelete(tool, id);
            }
            toast.success('Deleted');
            load(page, search);
            onDeleted?.();
        } catch {
            toast.error('Delete failed');
        }
    };

    const handleBatchDelete = async () => {
        if (!selected.size) return;
        setConfirmDelete({ show: true, batch: true });
    };

    const confirmBatchDeleteAction = async () => {
        const ids = Array.from(selected);
        if (!ids.length) return;
        try {
            if (isAdminMode) {
                await fileCenterHistoryApi.adminBatchDelete(tool, ids);
            } else {
                await fileCenterHistoryApi.batchDelete(tool, ids);
            }
            toast.success(`Deleted ${ids.length} records`);
            setSelected(new Set());
            load(page, search);
            onDeleted?.();
        } catch {
            toast.error('Batch delete failed');
        }
    };

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === items.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(items.map(i => i.id)));
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    };

    const getItemLabel = (item: HistoryItem): string => {
        const p = item.params as Record<string, unknown>;
        const s = item.source as Record<string, unknown>;
        return (
            (p.filename as string) ||
            (p.source_filename as string) ||
            (s.file_name as string) ||
            (p.input_prompt as string) ||
            (p.tool as string) ||
            item.tool ||
            'Untitled'
        );
    };

    return (
        <>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <span className={styles.toolbarTitle}>
                        <i className="fas fa-clock" /> {TOOL_LABELS[tool] || tool} History
                    </span>
                    <span className={styles.pageInfo}>{total} records</span>
                </div>
                <div className={styles.toolbarRight}>
                    <input
                        className={styles.searchInput}
                        placeholder="Search..."
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                    />
                    {selected.size > 0 && (
                        <button type="button" className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} onClick={handleBatchDelete}>
                            <i className="fas fa-trash" /> Delete {selected.size}
                        </button>
                    )}
                </div>
            </div>

            {/* Cards Grid */}
            {items.length === 0 && !loading ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}><i className="fas fa-inbox" /></div>
                    No history records found
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px', paddingLeft: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', color: 'var(--text-sub, #475569)', fontWeight: 500 }}>
                            <input 
                                type="checkbox" 
                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                                checked={items.length > 0 && selected.size === items.length} 
                                onChange={toggleAll} 
                            />
                            <span>Select All ({selected.size}/{items.length})</span>
                        </label>
                    </div>
                    <div className={styles.historyGrid}>
                    {items.map(item => (
                        <div 
                            key={item.id} 
                            className={`${styles.historyItemCard} ${selected.has(item.id) ? styles.selected : ''}`}
                            onClick={() => toggleSelect(item.id)}
                        >
                            <div className={styles.cardSelectBadge}>
                                <i className="fas fa-check" />
                            </div>
                            
                            <div className={styles.cardHeader}>
                                <div className={styles.cardTitle}>{getItemLabel(item)}</div>
                                <div className={styles.cardDate}>{formatDate(item.created_at)}</div>
                            </div>
                            
                            <div className={styles.cardPreview}>{item.preview || 'No preview available'}</div>
                            
                            <div className={styles.cardActions}>
                                <div 
                                    className={styles.cardActionBtn} 
                                    onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                                >
                                    <i className="fas fa-eye" /> View
                                </div>
                                <div 
                                    className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`} 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                >
                                    <i className="fas fa-trash" /> Delete
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <i className="fas fa-chevron-left" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let p: number;
                        if (totalPages <= 7) {
                            p = i + 1;
                        } else if (page <= 4) {
                            p = i + 1;
                        } else if (page >= totalPages - 3) {
                            p = totalPages - 6 + i;
                        } else {
                            p = page - 3 + i;
                        }
                        return (
                            <button
                                key={p}
                                className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`}
                                onClick={() => setPage(p)}
                            >
                                {p}
                            </button>
                        );
                    })}
                    <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        <i className="fas fa-chevron-right" />
                    </button>
                </div>
            )}
            <ConfirmModal 
                open={confirmDelete.show}
                title={confirmDelete.batch ? "Batch Delete" : "Delete Record"}
                message={confirmDelete.batch ? `Are you sure you want to delete ${selected.size} records?` : "Are you sure you want to delete this history record?"}
                confirmLabel="Delete"
                confirmDanger={true}
                onClose={() => setConfirmDelete({ show: false })}
                onConfirm={() => {
                    if (confirmDelete.batch) confirmBatchDeleteAction();
                    else confirmDeleteAction();
                }}
            />
            {detailItem && (
                <HistoryDetailModal
                    item={detailItem}
                    tool={tool}
                    onClose={() => setDetailItem(null)}
                    onDelete={() => {
                        setDetailItem(null);
                        handleDelete(detailItem.id);
                    }}
                />
            )}
        </>
    );
}
