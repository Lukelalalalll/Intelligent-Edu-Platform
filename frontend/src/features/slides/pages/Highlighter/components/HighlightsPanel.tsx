import React, { useState, useMemo } from 'react';
import styles from '../styles/highlighter.module.css';

const CATEGORY_COLORS = {
    definition: { bg: '#E3F2FD', color: '#1565C0', icon: 'fa-book' },
    concept: { bg: '#F3E5F5', color: '#7B1FA2', icon: 'fa-lightbulb' },
    formula: { bg: '#FFF3E0', color: '#E65100', icon: 'fa-square-root-variable' },
    example: { bg: '#E8F5E9', color: '#2E7D32', icon: 'fa-flask' },
    conclusion: { bg: '#FFF8E1', color: '#F57F17', icon: 'fa-flag-checkered' },
    caution: { bg: '#FCE4EC', color: '#C62828', icon: 'fa-exclamation-triangle' },
};

const CATEGORIES = ['all', 'definition', 'concept', 'formula', 'example', 'conclusion', 'caution'];

const HighlightsPanel = ({
    statusMsg, saveHighlights, exportHighlights,
    scrollToHighlight, handleLocalRemoveHighlight,
    classifyHighlights, classifying,
    categoryFilter, setCategoryFilter,
    removeByCategoryOrConfidence,
    highlights
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [speakingId, setSpeakingId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const speakText = (id, text) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        if (speakingId === id) {
            window.speechSynthesis.cancel();
            setSpeakingId(null);
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setSpeakingId(null);
        setSpeakingId(id);
        window.speechSynthesis.speak(utterance);
    };

    const copyToClipboard = (id, text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const filteredHighlights = useMemo(() => {
        return (highlights || []).filter(h => {
            const matchSearch = h.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                h.sectionTitle?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchCategory = !categoryFilter || categoryFilter === 'all' || h.category === categoryFilter;
            return matchSearch && matchCategory;
        });
    }, [highlights, searchQuery, categoryFilter]);

    const { hasClassified, categoryStats } = useMemo(() => {
        const stats = {};
        let classified = false;
        (highlights || []).forEach(h => {
            if (h.category) {
                classified = true;
                stats[h.category] = (stats[h.category] || 0) + 1;
            }
        });
        return { hasClassified: classified, categoryStats: stats };
    }, [highlights]);

    return (
        <div className={`card ${styles.highlightsCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.cardIcon} style={{ color: '#00B8D9', background: 'rgba(0, 184, 217, 0.1)' }}>
                    <i className="fas fa-highlighter"></i>
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Highlights</h2>
            </div>

            <div className={styles.panelLayout}>
                <div className={styles.panelControls}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <button className={styles.btnPrimary} style={{ flex: 2 }} onClick={saveHighlights}>
                            <i className="fas fa-cloud-upload-alt"></i> Save All
                        </button>
                        <button
                            className={styles.toggleViewBtn}
                            style={{ flex: 1.5, opacity: classifying ? 0.6 : 1 }}
                            onClick={classifyHighlights}
                            disabled={classifying || !highlights?.length}
                            title="AI Classify highlights by category"
                        >
                            <i className={classifying ? 'fas fa-spinner fa-spin' : 'fas fa-tags'}></i>
                            {classifying ? '' : ' Classify'}
                        </button>
                        <button className={styles.toggleViewBtn} style={{ flex: 1 }} onClick={exportHighlights} title="Export as Markdown">
                            <i className="fas fa-download"></i>
                        </button>
                    </div>

                    {/* Category filter bar */}
                    {hasClassified && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                            {CATEGORIES.map(cat => {
                                const isAll = cat === 'all';
                                const active = categoryFilter === cat;
                                const catStyle = !isAll ? CATEGORY_COLORS[cat] : null;
                                const count = isAll ? (highlights || []).length : (categoryStats[cat] || 0);
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setCategoryFilter?.(cat)}
                                        className={`${styles.categoryFilterBtn} ${active ? styles.categoryFilterBtnActive : ''}`}
                                        style={{
                                            ...(active && catStyle ? { background: catStyle.bg, color: catStyle.color } : {})
                                        }}
                                    >
                                        {!isAll && catStyle && <i className={`fas ${catStyle.icon}`} style={{ marginRight: 3, fontSize: '0.65rem' }}></i>}
                                        {cat}{count > 0 ? ` (${count})` : ''}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Batch actions for classified highlights */}
                    {hasClassified && categoryFilter !== 'all' && categoryFilter && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                            <button
                                className={styles.toggleViewBtn}
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                onClick={() => removeByCategoryOrConfidence?.(categoryFilter)}
                                title={`Remove all ${categoryFilter} highlights`}
                            >
                                <i className="fas fa-trash-alt" style={{ marginRight: 4 }}></i>
                                Remove all {categoryFilter}
                            </button>
                        </div>
                    )}

                    <div className="search-box-container">
                        <i className="fas fa-search search-box-icon"></i>
                        <input
                            type="text"
                            className="search-box-input"
                            placeholder="Search keywords..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className={styles.statusMessage} style={{ color: statusMsg.includes('Error') || statusMsg.includes('failed') ? '#FFAB00' : '#4CAF50', fontWeight: 600 }}>
                        {statusMsg}
                    </div>
                </div>

                <div className={styles.highlightsList}>
                    {filteredHighlights.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 10px', color: '#ccc' }}>
                            <i className="fas fa-feather-alt" style={{ fontSize: '2rem', marginBottom: '10px', opacity: 0.3 }}></i>
                            <p style={{ fontSize: '0.9rem' }}>{searchQuery ? 'No results found' : 'Highlight text to see it here'}</p>
                        </div>
                    ) : (
                        filteredHighlights.map(h => {
                            const catStyle = h.category ? CATEGORY_COLORS[h.category] : null;
                            return (
                                <div key={h.id} className={styles.highlightItem} onClick={() => scrollToHighlight(h.id)} style={{ cursor: 'pointer' }}>
                                    <div className={styles.highlightHeader}>
                                        <span className={styles.sectionTitle}>
                                            {h.sectionTitle}
                                            {catStyle && (
                                                <span style={{
                                                    marginLeft: 8, padding: '1px 7px', borderRadius: 8,
                                                    fontSize: '0.65rem', fontWeight: 700,
                                                    background: catStyle.bg, color: catStyle.color,
                                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                                }}>
                                                    <i className={`fas ${catStyle.icon}`} style={{ fontSize: '0.6rem' }}></i>
                                                    {h.category}
                                                    {h.confidence != null && (
                                                        <span style={{ opacity: 0.7, marginLeft: 2 }}>
                                                            {Math.round(h.confidence * 100)}%
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                        <div className="item-actions">
                                            <button className="tool-btn" onClick={(e) => { e.stopPropagation(); speakText(h.id, h.text); }} title="Listen">
                                                <i className={`fas ${speakingId === h.id ? 'fa-stop-circle' : 'fa-volume-up'}`} style={{ color: speakingId === h.id ? '#00B8D9' : '' }}></i>
                                            </button>
                                            <button className="tool-btn" onClick={(e) => { e.stopPropagation(); copyToClipboard(h.id, h.text); }} title="Copy">
                                                <i className={`fas ${copiedId === h.id ? 'fa-check' : 'fa-copy'}`} style={{ color: copiedId === h.id ? '#27c93f' : '' }}></i>
                                            </button>
                                            <button className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); handleLocalRemoveHighlight(h.id); }} title="Delete">
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className={styles.highlightText}>{h.text}</div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(HighlightsPanel);