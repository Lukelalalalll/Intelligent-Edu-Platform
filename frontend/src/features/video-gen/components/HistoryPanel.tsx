import React, { useState, useEffect } from 'react';
import * as api from '../../../api/videoHistoryApi';
import s from '../../../styles/history.module.css';

/**
 * Video generation history is read-only (no replay — pipeline is expensive).
 */
export default function HistoryPanel() {
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

    const fmt = (v: any, fb = '-') => {
        if (v == null) return fb;
        return String(v).trim() || fb;
    };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && !items.length) return <div className={s.historyLoadingState}>Loading history...</div>;
    if (!loading && !items.length) return <div className={s.historyEmptyState}>No video generation history yet.</div>;

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
                        <h4 className={s.historyDetailTitle}>Video Generation Details</h4>
                    </div>
                </div>

                {cur && (
                    <div className={s.historyDetailMetaCard}>
                        <div className={s.historyDetailMetaTop}>
                            <div>
                                <div className={s.historyDetailMetaPrimary}>
                                    <strong>Video</strong>
                                    {' · '}{fmt(cur.params?.lang)}
                                    {' · '}{fmt(cur.params?.provider)}
                                    {cur.params?.has_scenes && ' · Scene-based'}
                                </div>
                                <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                )}

                {cur && (
                    <div className={s.historyParamsPanel}>
                        <h5 className={s.historyParamsTitle}>Generation Parameters</h5>
                        <div className={s.historyParamsGrid}>
                            <div className={s.historyParamItem}><span>Language</span><strong>{fmt(cur.params?.lang)}</strong></div>
                            <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params?.provider)}</strong></div>
                            <div className={s.historyParamItem}><span>Subtitles</span><strong>{cur.params?.subtitles ? 'Yes' : 'No'}</strong></div>
                            <div className={s.historyParamItem}><span>Max Segments</span><strong>{fmt(cur.params?.max_segments)}</strong></div>
                            <div className={s.historyParamItem}><span>Audience</span><strong>{fmt(cur.params?.audience)}</strong></div>
                            {cur.params?.has_scenes && <div className={s.historyParamItem}><span>Scene Count</span><strong>{fmt(cur.params?.scene_count)}</strong></div>}
                        </div>
                    </div>
                )}

                <div className={s.historyDetailMarkdown}>
                    {detailLoading ? (
                        <div className={s.historyDetailLoading}>Loading details...</div>
                    ) : expandedData?.result ? (
                        (() => {
                            try {
                                const parsed = JSON.parse(expandedData.result);
                                return parsed.videoPath ? (
                                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                                        <p><strong>Video Path:</strong> {parsed.videoPath}</p>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Task ID: {parsed.task_id}</p>
                                    </div>
                                ) : (
                                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{expandedData.result}</pre>
                                );
                            } catch {
                                return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{expandedData.result}</pre>;
                            }
                        })()
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
                <h4 className={s.historyTitle}><i className="fas fa-history" /> Video History ({total})</h4>
                <div className={s.historyTitleHint}>Recent video generation records</div>
            </div>
            <div className={s.historyGrid}>
                {items.map((item, idx) => (
                    <div key={item.id} className={s.historyItemCard} style={{ animationDelay: `${Math.min(idx, 8) * 70}ms` }} onClick={() => toggleView(item)}>
                        <div className={s.historyItemTopRow}>
                            <div className={s.historyItemSubject}>Video Generation</div>
                            <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className={s.historyItemChips}>
                            <span className={s.historyChipPrimary}>{fmt(item.params?.lang, 'zh')}</span>
                            <span className={s.historyChip}>{fmt(item.params?.provider)}</span>
                            {item.params?.has_scenes && <span className={s.historyChip}>{item.params.scene_count} scenes</span>}
                        </div>
                        <div className={s.historyPreview}>{item.preview}</div>
                        <div className={s.historyActions}>
                            <button className={`${s.btn} ${s.btnPrimary} ${s.historyActionBtn}`} onClick={(e) => { e.stopPropagation(); toggleView(item); }}>View Details</button>
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
