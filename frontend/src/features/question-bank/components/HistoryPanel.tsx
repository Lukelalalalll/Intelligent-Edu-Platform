import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import * as sub2Api from '../../../api/questionBankApi';
import styles from '../styles/sub2.module.css';

export default function HistoryPanel({ onReplay }) {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [expandedResult, setExpandedResult] = useState('');
    const [detailLoading, setDetailLoading] = useState(false);

    const pageSize = 5;

    useEffect(() => {
        let cancelled = false;
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const data = await sub2Api.getGenerationHistory(page, pageSize);
                if (!cancelled) {
                    setItems(data.items);
                    setTotal(data.total);
                }
            } catch { /* ignore */ }
            finally { if (!cancelled) setLoading(false); }
        };
        fetchHistory();
        return () => { cancelled = true; };
    }, [page]);

    const toggleView = async (item) => {
        if (!item) {
            setExpandedId(null);
            setExpandedResult('');
            setDetailLoading(false);
            return;
        }
        try {
            setDetailLoading(true);
            const data = await sub2Api.getGenerationDetail(item.id);
            setExpandedId(item.id);
            setExpandedResult(String(data.result ?? ''));
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    };

    const handleReplay = (item) => {
        if (onReplay) onReplay(item);
    };

    const formatValue = (value, fallback = '-') => {
        if (value === null || value === undefined) return fallback;
        if (Array.isArray(value)) {
            const filtered = value.filter(v => String(v ?? '').trim() !== '');
            return filtered.length ? filtered.join(', ') : fallback;
        }
        const text = String(value).trim();
        return text || fallback;
    };

    const exportDetailMarkdown = (item, content) => {
        const markdown = String(content ?? '').trim();
        if (!markdown) return;

        const safeType = String(item?.params?.question_type || 'questions')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'questions';
        const ts = new Date(item?.created_at || Date.now()).toISOString().replace(/[:.]/g, '-');
        const fileName = `history-${safeType}-${ts}.md`;

        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && items.length === 0) {
        return <div className={styles.historyLoadingState}>Loading history...</div>;
    }

    if (!loading && items.length === 0) {
        return <div className={styles.historyEmptyState}>No generation history yet.</div>;
    }

    if (expandedId) {
        const currentItem = items.find(i => i.id === expandedId);
        return (
            <div className={styles.historyDetailView}>
                <div className={styles.historyDetailHeader}>
                    <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.historyBackBtn}`}
                        onClick={() => toggleView(null)}
                    >
                        <i className={`fas fa-arrow-left ${styles.historyIconGap}`}></i>Back
                    </button>
                    <div className={styles.historyDetailHeadingBlock}>
                        <span className={styles.historyDetailBadge}>Detail</span>
                        <h4 className={styles.historyDetailTitle}>Generation Details</h4>
                    </div>
                </div>

                {currentItem && (
                    <div className={styles.historyDetailMetaCard}>
                        <div className={styles.historyDetailMetaTop}>
                            <div>
                                <div className={styles.historyDetailMetaPrimary}>
                                    <strong>{currentItem.params.subject}</strong>
                                    {' · '}{currentItem.params.question_type}
                                    {' · '}{currentItem.params.num_questions} questions
                                    {' · Difficulty '}{currentItem.params.difficulty}
                                </div>
                                <div className={styles.historyDetailMetaTime}>
                                    {new Date(currentItem.created_at).toLocaleString()}
                                </div>
                            </div>
                            <div className={styles.historyDetailActionGroup}>
                                <button
                                    className={`${styles.btn} ${styles.btnSecondary} ${styles.historyExportBtn}`}
                                    onClick={() => exportDetailMarkdown(currentItem, expandedResult)}
                                    disabled={detailLoading || !expandedResult}
                                >
                                    <i className={`fas fa-file-export ${styles.historyIconGap}`}></i>Export to .md
                                </button>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary} ${styles.historyReplayBtn}`}
                                    onClick={() => handleReplay(currentItem)}
                                >
                                    <i className={`fas fa-redo ${styles.historyIconGap}`}></i>Replay
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {currentItem && (
                    <div className={styles.historyParamsPanel}>
                        <h5 className={styles.historyParamsTitle}>Generation Parameters</h5>
                        <div className={styles.historyParamsGrid}>
                            <div className={styles.historyParamItem}><span>Question Type</span><strong>{formatValue(currentItem.params?.question_type)}</strong></div>
                            <div className={styles.historyParamItem}><span>Question Number</span><strong>{formatValue(currentItem.params?.num_questions)}</strong></div>
                            <div className={styles.historyParamItem}><span>Difficulty</span><strong>{formatValue(currentItem.params?.difficulty)}</strong></div>
                            <div className={styles.historyParamItem}><span>Language</span><strong>{formatValue(currentItem.params?.output_language)}</strong></div>
                            <div className={styles.historyParamItem}><span>Source Type</span><strong>{formatValue(currentItem.params?.source_type)}</strong></div>
                            <div className={styles.historyParamItem}><span>Page Numbers</span><strong>{formatValue(currentItem.params?.page_numbers)}</strong></div>
                            <div className={`${styles.historyParamItem} ${styles.historyParamItemFull}`}><span>Constraints</span><strong>{formatValue(currentItem.params?.constraints)}</strong></div>
                        </div>
                    </div>
                )}

                <div className={`${styles.markdownContainer} ${styles.historyDetailMarkdown}`}>
                    {detailLoading ? (
                        <div className={styles.historyDetailLoading}>Loading details...</div>
                    ) : (
                        <ReactMarkdown>{expandedResult}</ReactMarkdown>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.historyListView}>
            <div className={styles.historyTitleRow}>
                <h4 className={styles.historyTitle}>
                    <i className="fas fa-history"></i>
                    Generation History ({total})
                </h4>
                <div className={styles.historyTitleHint}>Recent generation snapshots and quick replay</div>
            </div>
            <div className={styles.historyGrid}>
                {items.map((item, index) => (
                    <div key={item.id}
                    className={styles.historyItemCard}
                    style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
                    onClick={() => toggleView(item)}
                    >
                        <div className={styles.historyItemTopRow}>
                            <div className={styles.historyItemSubject}>
                                {item.params.subject}
                            </div>
                            <div className={styles.historyItemDate} title={new Date(item.created_at).toLocaleString()}>
                                {new Date(item.created_at).toLocaleDateString()}
                            </div>
                        </div>

                        <div className={styles.historyItemChips}>
                            <span className={styles.historyChipPrimary}>{item.params.question_type}</span>
                            <span className={styles.historyChip}>{item.params.num_questions} qs</span>
                            <span className={styles.historyChip}>Lv {item.params.difficulty}</span>
                        </div>

                        <div className={styles.historyPreview}>
                            {item.preview}
                        </div>

                        <div className={styles.historyActions}>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary} ${styles.historyActionBtn}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleView(item);
                                }}
                            >
                                View Details
                            </button>
                            <button
                                className={`${styles.btn} ${styles.btnSecondary} ${styles.historyActionBtn}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleReplay(item);
                                }}
                            >
                                <i className={`fas fa-redo ${styles.historyIconGap}`}></i>Replay
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {totalPages > 1 && (
                <div className={styles.historyPagination}>
                    <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.historyPageBtn}`}
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                    >
                        <i className={`fas fa-chevron-left ${styles.historyIconGap}`}></i>Prev
                    </button>
                    <span className={styles.historyPageText}>Page {page} of {totalPages}</span>
                    <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.historyPageBtn}`}
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next<i className={`fas fa-chevron-right ${styles.historyIconGap}`}></i>
                    </button>
                </div>
            )}
        </div>
    );
}
