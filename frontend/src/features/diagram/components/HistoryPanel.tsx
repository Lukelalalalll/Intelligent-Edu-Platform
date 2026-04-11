import React, { useState, useEffect } from 'react';
import * as api from '../../../api/diagramHistoryApi';
import s from '../../../styles/history.module.css';

export default function HistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedData, setExpandedData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const pageSize = 5;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await api.getGenerationHistory(page, pageSize);
                if (!cancelled) { setItems(data.items); setTotal(data.total); }
            } catch { /* ignore */ }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [page]);

    const toggleView = async (item: any) => {
        if (!item) { setExpandedId(null); setExpandedData(null); return; }
        try {
            setDetailLoading(true);
            const data = await api.getGenerationDetail(item.id);
            setExpandedId(item.id);
            setExpandedData(data);
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    };

    const handleReplay = (item: any) => { if (onReplay) onReplay(item); };

    const fmt = (v: any, fb = '-') => {
        if (v == null) return fb;
        if (Array.isArray(v)) { const f = v.filter(x => String(x ?? '').trim()); return f.length ? f.join(', ') : fb; }
        return String(v).trim() || fb;
    };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && !items.length) return <div className={s.historyLoadingState}>Loading history...</div>;
    if (!loading && !items.length) return <div className={s.historyEmptyState}>No generation history yet.</div>;

    if (expandedId) {
        const cur = items.find(i => i.id === expandedId);
        return (
            <div className={s.historyDetailView}>
                <div className={s.historyDetailHeader}>
                    <button className={`${s.btn} ${s.btnSecondary} ${s.historyBackBtn}`} onClick={() => toggleView(null)}>
                        <i className={`fas fa-arrow-left ${s.historyIconGap}`} />Back
                    </button>
                    <div className={s.historyDetailHeadingBlock}>
                        <span className={s.historyDetailBadge}>Detail</span>
                        <h4 className={s.historyDetailTitle}>Diagram Generation Details</h4>
                    </div>
                </div>

                {cur && (
                    <div className={s.historyDetailMetaCard}>
                        <div className={s.historyDetailMetaTop}>
                            <div>
                                <div className={s.historyDetailMetaPrimary}>
                                    <strong>{fmt(cur.params?.service_type)}</strong>
                                    {' · '}{fmt(cur.params?.provider)}
                                </div>
                                <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                            </div>
                            <div className={s.historyDetailActionGroup}>
                                <button className={`${s.btn} ${s.btnPrimary} ${s.historyReplayBtn}`} onClick={() => handleReplay(cur)}>
                                    <i className={`fas fa-redo ${s.historyIconGap}`} />Replay
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {cur && (
                    <div className={s.historyParamsPanel}>
                        <h5 className={s.historyParamsTitle}>Generation Parameters</h5>
                        <div className={s.historyParamsGrid}>
                            <div className={s.historyParamItem}><span>Service</span><strong>{fmt(cur.params?.service_type)}</strong></div>
                            <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params?.provider)}</strong></div>
                            <div className={s.historyParamItem}><span>Draft Quality</span><strong>{fmt(cur.params?.draft_quality)}</strong></div>
                            <div className={s.historyParamItem}><span>Refined</span><strong>{cur.params?.refined ? 'Yes' : 'No'}</strong></div>
                            <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Input Prompt</span><strong>{fmt(cur.params?.input_prompt)}</strong></div>
                        </div>
                    </div>
                )}

                <div className={s.historyDetailMarkdown}>
                    {detailLoading ? (
                        <div className={s.historyDetailLoading}>Loading details...</div>
                    ) : expandedData?.result ? (
                        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{expandedData.result}</pre>
                    ) : (
                        <div className={s.historyDetailLoading}>No result data available.</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={s.historyListView}>
            <div className={s.historyTitleRow}>
                <h4 className={s.historyTitle}><i className="fas fa-history" /> Generation History ({total})</h4>
                <div className={s.historyTitleHint}>Recent diagram generations and quick replay</div>
            </div>
            <div className={s.historyGrid}>
                {items.map((item, idx) => (
                    <div key={item.id} className={s.historyItemCard} style={{ animationDelay: `${Math.min(idx, 8) * 70}ms` }} onClick={() => toggleView(item)}>
                        <div className={s.historyItemTopRow}>
                            <div className={s.historyItemSubject}>{fmt(item.params?.service_type, 'Diagram')}</div>
                            <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className={s.historyItemChips}>
                            <span className={s.historyChipPrimary}>{fmt(item.params?.service_type)}</span>
                            {item.params?.provider && <span className={s.historyChip}>{item.params.provider}</span>}
                        </div>
                        <div className={s.historyPreview}>{item.preview}</div>
                        <div className={s.historyActions}>
                            <button className={`${s.btn} ${s.btnPrimary} ${s.historyActionBtn}`} onClick={(e) => { e.stopPropagation(); toggleView(item); }}>View Details</button>
                            <button className={`${s.btn} ${s.btnSecondary} ${s.historyActionBtn}`} onClick={(e) => { e.stopPropagation(); handleReplay(item); }}>
                                <i className={`fas fa-redo ${s.historyIconGap}`} />Replay
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {totalPages > 1 && (
                <div className={s.historyPagination}>
                    <button className={`${s.btn} ${s.btnSecondary} ${s.historyPageBtn}`} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <i className={`fas fa-chevron-left ${s.historyIconGap}`} />Prev
                    </button>
                    <span className={s.historyPageText}>Page {page} of {totalPages}</span>
                    <button className={`${s.btn} ${s.btnSecondary} ${s.historyPageBtn}`} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        Next<i className={`fas fa-chevron-right ${s.historyIconGap}`} />
                    </button>
                </div>
            )}
        </div>
    );
}
