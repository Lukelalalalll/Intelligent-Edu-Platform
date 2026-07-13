import React, { useState, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import s from '@/styles/history.module.css';

/* ═══════════════════════════════════════════════════════════
   Generic HistoryPanel — shared state/pagination skeleton.
   Each feature supplies its own API adapter + render slots.
   ═══════════════════════════════════════════════════════════ */

export interface HistoryApi<TItem, TDetail> {
    getHistory: (page: number, pageSize: number) => Promise<{ items: TItem[]; total: number }>;
    getDetail: (id: string) => Promise<TDetail>;
}

export interface HistoryPanelProps<TItem extends { id: string }, TDetail> {
    api: HistoryApi<TItem, TDetail>;
    /** Title shown in the list header, e.g. "Diagram History" */
    title: string;
    /** Subtitle hint text */
    subtitle?: string;
    /** Detail view heading, e.g. "Diagram Generation Details" */
    detailTitle?: string;
    /** Render the card body for a list item */
    renderCard: (item: TItem) => ReactNode;
    /** Render the meta section in detail view */
    renderDetailMeta?: (item: TItem) => ReactNode;
    /** Render the params grid in detail view */
    renderDetailParams?: (item: TItem) => ReactNode;
    /** Render the result content in detail view. Receives raw detail data. */
    renderDetailContent: (detail: TDetail | null, item: TItem | null) => ReactNode;
    /** Extra action buttons in detail header (e.g. Export .md) */
    renderDetailActions?: (item: TItem, detail: TDetail | null) => ReactNode;
    /** Called when user clicks Replay. If omitted, no replay button is shown. */
    onReplay?: (item: TItem) => void;
    /** Override the shared CSS module (e.g. question-bank uses its own) */
    styles?: Record<string, string>;
    pageSize?: number;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    return 'Unknown error';
}

export default function HistoryPanel<TItem extends { id: string }, TDetail>({
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
}: HistoryPanelProps<TItem, TDetail>) {
    const c = cx || s;

    const [items, setItems] = useState<TItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedItem, setExpandedItem] = useState<TItem | null>(null);
    const [expandedData, setExpandedData] = useState<TDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);

    const listRequestIdRef = useRef(0);
    const detailRequestIdRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const requestId = ++listRequestIdRef.current;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await api.getHistory(page, pageSize);
                if (!cancelled && requestId === listRequestIdRef.current) {
                    setItems(data.items);
                    setTotal(data.total);
                }
            } catch (err: unknown) {
                if (!cancelled && requestId === listRequestIdRef.current) {
                    setError(`Failed to load history: ${getErrorMessage(err)}`);
                }
            } finally {
                if (!cancelled && requestId === listRequestIdRef.current) {
                    setLoading(false);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [page, pageSize, api]);

    const toggleView = async (item: TItem | null) => {
        if (!item) {
            detailRequestIdRef.current += 1;
            setExpandedId(null);
            setExpandedItem(null);
            setExpandedData(null);
            setDetailError(null);
            setDetailLoading(false);
            return;
        }

        const requestId = ++detailRequestIdRef.current;

        setExpandedId(item.id);
        setExpandedItem(item);
        setExpandedData(null);
        setDetailError(null);
        setDetailLoading(true);

        try {
            const data = await api.getDetail(item.id);
            if (requestId === detailRequestIdRef.current) {
                setExpandedData(data);
            }
        } catch (err: unknown) {
            if (requestId === detailRequestIdRef.current) {
                setDetailError(`Failed to load detail: ${getErrorMessage(err)}`);
            }
        } finally {
            if (requestId === detailRequestIdRef.current) {
                setDetailLoading(false);
            }
        }
    };

    const handleReplay = (item: TItem) => { if (onReplay) onReplay(item); };

    const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, item: TItem) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void toggleView(item);
        }
    };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && !items.length) return <div className={c.historyLoadingState}>Loading history...</div>;
    if (error && !items.length) return <div className={c.historyEmptyState}>{error}</div>;
    if (!loading && !items.length) return <div className={c.historyEmptyState}>No generation history yet.</div>;

    const renderDetailView = () => {
        if (!expandedId) return null;

        const cur = expandedItem;

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

                {detailError && (
                    <div className={c.historyEmptyState}>{detailError}</div>
                )}

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
    };

    const renderListView = () => (
        <div className={c.historyListView}>
            {error && <div className={c.historyEmptyState}>{error}</div>}

            <div className={c.historyTitleRow}>
                <h4 className={c.historyTitle}><i className="fas fa-history" /> {title} ({total})</h4>
                {subtitle && <div className={c.historyTitleHint}>{subtitle}</div>}
            </div>

            <div className={c.historyGrid}>
                {items.map((item, idx) => (
                    <div
                        key={item.id}
                        className={c.historyItemCard}
                        style={{ animationDelay: `${Math.min(idx, 8) * 70}ms` }}
                        onClick={() => { void toggleView(item); }}
                        onKeyDown={(event) => handleCardKeyDown(event, item)}
                        role="button"
                        tabIndex={0}
                    >
                        {renderCard(item)}
                        <div className={c.historyActions}>
                            <button className={`${c.btn} ${c.btnPrimary} ${c.historyActionBtn}`} onClick={(e) => { e.stopPropagation(); void toggleView(item); }}>
                                View Details
                            </button>
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
                    <button className={`${c.btn} ${c.btnSecondary} ${c.historyPageBtn}`} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        <i className={`fas fa-chevron-left ${c.historyIconGap}`} />Prev
                    </button>
                    <span className={c.historyPageText}>Page {page} of {totalPages}</span>
                    <button className={`${c.btn} ${c.btnSecondary} ${c.historyPageBtn}`} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        Next<i className={`fas fa-chevron-right ${c.historyIconGap}`} />
                    </button>
                </div>
            )}
        </div>
    );

    return expandedId ? renderDetailView() : renderListView();
}
