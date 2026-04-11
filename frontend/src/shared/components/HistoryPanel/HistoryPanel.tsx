import React, { useState, useEffect, type ReactNode } from 'react';
import s from '@/styles/history.module.css';

/* ═══════════════════════════════════════════════════════════
   Generic HistoryPanel — shared state/pagination skeleton.
   Each feature supplies its own API adapter + render slots.
   ═══════════════════════════════════════════════════════════ */

export interface HistoryApi {
    getHistory: (page: number, pageSize: number) => Promise<{ items: any[]; total: number }>;
    getDetail: (id: string) => Promise<any>;
}

export interface HistoryPanelProps {
    api: HistoryApi;
    /** Title shown in the list header, e.g. "Diagram History" */
    title: string;
    /** Subtitle hint text */
    subtitle?: string;
    /** Detail view heading, e.g. "Diagram Generation Details" */
    detailTitle?: string;
    /** Render the card body for a list item */
    renderCard: (item: any) => ReactNode;
    /** Render the meta section in detail view */
    renderDetailMeta?: (item: any) => ReactNode;
    /** Render the params grid in detail view */
    renderDetailParams?: (item: any) => ReactNode;
    /** Render the result content in detail view. Receives raw detail data. */
    renderDetailContent: (detail: any, item: any) => ReactNode;
    /** Extra action buttons in detail header (e.g. Export .md) */
    renderDetailActions?: (item: any, detail: any) => ReactNode;
    /** Called when user clicks Replay. If omitted, no replay button is shown. */
    onReplay?: (item: any) => void;
    /** Override the shared CSS module (e.g. question-bank uses its own) */
    styles?: Record<string, string>;
    pageSize?: number;
}

export default function HistoryPanel({
    api,
    title,
    subtitle,
    detailTitle = 'Generation Details',
    renderCard,
    renderDetailMeta,
    renderDetailParams,
    renderDetailContent,
    renderDetailActions,
    onReplay,
    styles: cx,
    pageSize = 5,
}: HistoryPanelProps) {
    const c = cx || s;

    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedData, setExpandedData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await api.getHistory(page, pageSize);
                if (!cancelled) { setItems(data.items); setTotal(data.total); }
            } catch { /* ignore */ }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [page, pageSize, api]);

    const toggleView = async (item: any) => {
        if (!item) { setExpandedId(null); setExpandedData(null); return; }
        try {
            setDetailLoading(true);
            const data = await api.getDetail(item.id);
            setExpandedId(item.id);
            setExpandedData(data);
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    };

    const handleReplay = (item: any) => { if (onReplay) onReplay(item); };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && !items.length) return <div className={c.historyLoadingState}>Loading history...</div>;
    if (!loading && !items.length) return <div className={c.historyEmptyState}>No generation history yet.</div>;

    // ── Detail view ──
    if (expandedId) {
        const cur = items.find(i => i.id === expandedId);
        return (
            <div className={c.historyDetailView}>
                <div className={c.historyDetailHeader}>
                    <button className={`${c.btn} ${c.btnSecondary} ${c.historyBackBtn}`} onClick={() => toggleView(null)}>
                        <i className={`fas fa-arrow-left ${c.historyIconGap}`} />Back
                    </button>
                    <div className={c.historyDetailHeadingBlock}>
                        <span className={c.historyDetailBadge}>Detail</span>
                        <h4 className={c.historyDetailTitle}>{detailTitle}</h4>
                    </div>
                </div>

                {cur && renderDetailMeta && (
                    <div className={c.historyDetailMetaCard}>
                        <div className={c.historyDetailMetaTop}>
                            {renderDetailMeta(cur)}
                            <div className={c.historyDetailActionGroup}>
                                {renderDetailActions?.(cur, expandedData)}
                                {onReplay && (
                                    <button className={`${c.btn} ${c.btnPrimary} ${c.historyReplayBtn}`} onClick={() => handleReplay(cur)}>
                                        <i className={`fas fa-redo ${c.historyIconGap}`} />Replay
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {cur && renderDetailParams && (
                    <div className={c.historyParamsPanel}>
                        <h5 className={c.historyParamsTitle}>Generation Parameters</h5>
                        <div className={c.historyParamsGrid}>
                            {renderDetailParams(cur)}
                        </div>
                    </div>
                )}

                <div className={c.historyDetailMarkdown}>
                    {detailLoading
                        ? <div className={c.historyDetailLoading}>Loading details...</div>
                        : renderDetailContent(expandedData, cur)}
                </div>
            </div>
        );
    }

    // ── List view ──
    return (
        <div className={c.historyListView}>
            <div className={c.historyTitleRow}>
                <h4 className={c.historyTitle}><i className="fas fa-history" /> {title} ({total})</h4>
                {subtitle && <div className={c.historyTitleHint}>{subtitle}</div>}
            </div>
            <div className={c.historyGrid}>
                {items.map((item, idx) => (
                    <div key={item.id} className={c.historyItemCard} style={{ animationDelay: `${Math.min(idx, 8) * 70}ms` }} onClick={() => toggleView(item)}>
                        {renderCard(item)}
                        <div className={c.historyActions}>
                            <button className={`${c.btn} ${c.btnPrimary} ${c.historyActionBtn}`} onClick={(e) => { e.stopPropagation(); toggleView(item); }}>View Details</button>
                            {onReplay && (
                                <button className={`${c.btn} ${c.btnSecondary} ${c.historyActionBtn}`} onClick={(e) => { e.stopPropagation(); handleReplay(item); }}>
                                    <i className={`fas fa-redo ${c.historyIconGap}`} />Replay
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {totalPages > 1 && (
                <div className={c.historyPagination}>
                    <button className={`${c.btn} ${c.btnSecondary} ${c.historyPageBtn}`} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <i className={`fas fa-chevron-left ${c.historyIconGap}`} />Prev
                    </button>
                    <span className={c.historyPageText}>Page {page} of {totalPages}</span>
                    <button className={`${c.btn} ${c.btnSecondary} ${c.historyPageBtn}`} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        Next<i className={`fas fa-chevron-right ${c.historyIconGap}`} />
                    </button>
                </div>
            )}
        </div>
    );
}
