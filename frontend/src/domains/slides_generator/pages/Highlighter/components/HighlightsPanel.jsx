import React from 'react';
import styles from '../../../../../styles/sub1/highlighter.module.css';

export default function HighlightsPanel({
    searchQuery, setSearchQuery, statusMsg,
    filteredHighlights, saveHighlights, exportHighlights,
    scrollToHighlight, speakText, speakingId,
    copyToClipboard, copiedId, handleLocalRemoveHighlight
}) {
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
                        <button className={styles.toggleViewBtn} style={{ flex: 1 }} onClick={exportHighlights} title="Export as Markdown">
                            <i className="fas fa-download"></i>
                        </button>
                    </div>

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
                    <div className={styles.statusMessage} style={{ color: statusMsg.includes('Error') ? '#FFAB00' : '#4CAF50', fontWeight: 600 }}>
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
                        filteredHighlights.map(h => (
                            <div key={h.id} className={styles.highlightItem} onClick={() => scrollToHighlight(h.id)} style={{ cursor: 'pointer' }}>
                                <div className={styles.highlightHeader}>
                                    <span className={styles.sectionTitle}>{h.sectionTitle}</span>
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
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}