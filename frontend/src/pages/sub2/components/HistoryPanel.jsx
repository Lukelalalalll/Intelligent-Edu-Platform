import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import * as sub2Api from '../../../api/sub2Api';
import styles from '../../../styles/sub2/sub2.module.css';

export default function HistoryPanel({ onReplay }) {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [expandedResult, setExpandedResult] = useState('');

    const pageSize = 5;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        sub2Api.getGenerationHistory(page, pageSize)
            .then(data => {
                if (cancelled) return;
                if (data.success) {
                    setItems(data.items);
                    setTotal(data.total);
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [page]);

    const toggleExpand = async (id) => {
        if (expandedId === id) {
            setExpandedId(null);
            setExpandedResult('');
            return;
        }
        try {
            const data = await sub2Api.getGenerationDetail(id);
            if (data.success) {
                setExpandedId(id);
                setExpandedResult(data.result);
            }
        } catch { /* ignore */ }
    };

    const handleReplay = (item) => {
        if (onReplay) onReplay(item.params);
    };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && items.length === 0) {
        return <div style={{ padding: '1rem', opacity: 0.6 }}>Loading history...</div>;
    }

    if (!loading && items.length === 0) {
        return <div style={{ padding: '1rem', opacity: 0.5, fontSize: '0.9rem' }}>No generation history yet.</div>;
    }

    return (
        <div style={{ marginTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>
                <i className="fas fa-history" style={{ marginRight: '6px' }}></i>
                Generation History ({total})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map(item => (
                    <div key={item.id} style={{
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        background: expandedId === item.id ? 'rgba(var(--primary-rgb, 76, 175, 80), 0.05)' : 'transparent',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '0.85rem' }}>
                                <strong>{item.params.subject}</strong>
                                {' · '}{item.params.question_type}
                                {' · '}{item.params.num_questions} questions
                                {' · Difficulty '}{item.params.difficulty}
                            </div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                {new Date(item.created_at).toLocaleString()}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.preview}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button
                                className={`${styles.btn} ${styles.btnSecondary}`}
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                onClick={() => toggleExpand(item.id)}
                            >
                                {expandedId === item.id ? 'Collapse' : 'View'}
                            </button>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                onClick={() => handleReplay(item)}
                            >
                                <i className="fas fa-redo" style={{ marginRight: '4px' }}></i>Replay
                            </button>
                        </div>
                        {expandedId === item.id && expandedResult && (
                            <div className={styles.markdownContainer} style={{ marginTop: '0.75rem', maxHeight: '300px', overflow: 'auto' }}>
                                <ReactMarkdown>{expandedResult}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                    >Prev</button>
                    <span style={{ fontSize: '0.8rem', lineHeight: '28px' }}>{page} / {totalPages}</span>
                    <button
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                    >Next</button>
                </div>
            )}
        </div>
    );
}
