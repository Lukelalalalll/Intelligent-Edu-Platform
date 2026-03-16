// Highlighter.jsx
import React, { useEffect, useState } from 'react';
import styles from '../../styles/sub1/highlighter.module.css';

export default function Highlighter({
    loading, sections, currentSectionIndex, currentSectionTitle,
    isRenderedView, htmlContent, highlights, statusMsg,
    markdownViewRef,
    showSection, toggleView, saveHighlights, removeHighlight,
    onHighlightCreated
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [speakingId, setSpeakingId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const textLength = htmlContent ? htmlContent.replace(/<[^>]+>/g, '').length : 0;
    const readTime = Math.max(1, Math.ceil(textLength / 250));

    useEffect(() => {
        if (!loading && isRenderedView && markdownViewRef.current) {
            markdownViewRef.current.innerHTML = htmlContent;
        }
    }, [htmlContent, isRenderedView, loading, markdownViewRef]);

    useEffect(() => {
        return () => {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    // ======== 核心交互逻辑 ========
    const handleLocalRemoveHighlight = (id) => {
        if (!markdownViewRef.current) return;
        if (speakingId === id && typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            setSpeakingId(null);
        }
        const nodes = markdownViewRef.current.querySelectorAll(`span.highlighted[data-id="${id}"]`);
        nodes.forEach(node => {
            const parent = node.parentNode;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
        });
        removeHighlight(id);
    };

    const handleMouseUp = () => {
        if (!isRenderedView) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        const range = selection.getRangeAt(0);
        const container = markdownViewRef.current;
        if (!container || !container.contains(range.commonAncestorContainer)) return;

        const highlightId = 'hl-' + Date.now().toString();
        try {
            const spanTemplate = document.createElement('span');
            spanTemplate.className = 'highlighted';
            spanTemplate.dataset.id = highlightId;

            if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
                range.surroundContents(spanTemplate);
            } else {
                const fragment = range.extractContents();
                const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null, false);
                const textNodes = [];
                let node;
                while ((node = walker.nextNode())) {
                    if (node.nodeValue.trim().length > 0) textNodes.push(node);
                }
                textNodes.forEach(textNode => {
                    const span = spanTemplate.cloneNode();
                    textNode.parentNode.insertBefore(span, textNode);
                    span.appendChild(textNode);
                });
                range.insertNode(fragment);
            }
            selection.removeAllRanges();
            if (typeof onHighlightCreated === 'function') {
                onHighlightCreated({ id: highlightId, text: selectedText, sectionTitle: currentSectionTitle });
            }
        } catch (e) { console.error("Highlighting error:", e); }
    };

    // ======== 增强工具函数 ========
    const scrollToHighlight = (id) => {
        if (!markdownViewRef.current || !isRenderedView) return;
        const el = markdownViewRef.current.querySelector(`span.highlighted[data-id="${id}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.animate([
                { boxShadow: '0 0 0 0px rgba(0, 184, 217, 0)' },
                { boxShadow: '0 0 0 10px rgba(0, 184, 217, 0.4)' },
                { boxShadow: '0 0 0 0px rgba(0, 184, 217, 0)' }
            ], { duration: 1500 });
        }
    };

    const copyToClipboard = (id, text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

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

    const exportHighlights = () => {
        if (!highlights || highlights.length === 0) return;
        const grouped = highlights.reduce((acc, curr) => {
            (acc[curr.sectionTitle] = acc[curr.sectionTitle] || []).push(curr.text);
            return acc;
        }, {});
        let content = `# Learning Notes - ${new Date().toLocaleDateString()}\n\n`;
        for (const [sec, texts] of Object.entries(grouped)) {
            content += `## Section: ${sec}\n${texts.map(t => `> ${t}`).join('\n\n')}\n\n`;
        }
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Highlights_Notes.md`;
        a.click();
    };

    const filteredHighlights = (highlights || []).filter(h =>
        h.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.sectionTitle.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="container">
            <style>{`
                .stats-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 1.5rem; flex-wrap: wrap; }
                .stats-tag {
                    display: inline-flex; align-items: center; gap: 6px;
                    background: rgba(0, 123, 85, 0.04); color: var(--primary-color);
                    padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 700;
                    border: 1px solid rgba(0, 123, 85, 0.1);
                }
                .search-box-container { position: relative; margin-bottom: 16px; width: 100%; }
                .search-box-icon { 
                    position: absolute; left: 16px; top: 50%; 
                    transform: translateY(-50%); color: #00B8D9; 
                    z-index: 5; pointer-events: none; 
                }
                .search-box-input {
                    width: 100%; 
                    padding: 12px 16px 12px 48px !important; /* 关键修复：通过加大左侧内边距彻底避开图标 */
                    border-radius: 10px; border: 1.5px solid rgba(0, 184, 217, 0.1);
                    background: #fcfcfc; font-size: 0.9rem; transition: all 0.3s;
                }
                .search-box-input:focus { border-color: #00B8D9; background: #fff; box-shadow: 0 4px 12px rgba(0, 184, 217, 0.08); outline: none; }
                .item-actions { display: flex; gap: 6px; }
                .tool-btn {
                    width: 30px; height: 30px; border-radius: 6px; border: none; background: #f5f5f5;
                    color: #777; cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                }
                .tool-btn:hover { background: #00B8D9; color: #fff; transform: translateY(-2px); }
            `}</style>

            <div className="page-header">
                <h1>Markdown Highlighter</h1>
                <p className="subtitle">Read, highlight, and manage key concepts from your documents</p>
            </div>

            <div className={styles.workspaceGrid}>
                <div className={`card ${styles.readerCard}`}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardIcon}><i className="fas fa-book-open"></i></div>
                        <h2 style={{fontSize: '1.4rem', fontWeight: 700, margin: 0}}>Document Reader</h2>
                        <div className={`controls ${styles.msAuto}`}>
                            <button className={styles.toggleViewBtn} onClick={toggleView}>
                                {isRenderedView ? 'Switch to Raw' : 'Switch to Rendered'}
                            </button>
                        </div>
                    </div>

                    <div className="card-content">
                        <div className="stats-bar">
                            <div className={styles.pagination} style={{marginBottom: 0, padding: '5px'}}>
                                {sections.map((_, index) => {
                                    const isActive = Number(index) === Number(currentSectionIndex);
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            className={`${styles.pageBtn} ${isActive ? styles.pageBtnActive : ''}`}
                                            style={{
                                                backgroundColor: isActive ? 'var(--primary-color)' : '#ffffff',
                                                color: isActive ? '#ffffff' : 'var(--text-sub)',
                                                borderColor: isActive ? 'var(--primary-color)' : 'rgba(0,0,0,0.08)'
                                            }}
                                            onClick={() => showSection(index)}
                                        >
                                            {index + 1}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="stats-tag"><i className="fas fa-file-alt"></i> {textLength} Characters</div>
                            <div className="stats-tag"><i className="fas fa-clock"></i> ~{readTime} Min Read</div>
                        </div>

                        <div className={styles.markdownContainer} onMouseUp={handleMouseUp}>
                            {loading ? (
                                <div className={styles.loadingState}><i className="fas fa-spinner fa-spin"></i><p>Loading document...</p></div>
                            ) : isRenderedView ? (
                                <>
                                    <h2 style={{ borderBottom: '2px solid rgba(0, 123, 85, 0.2)', paddingBottom: '0.6rem', color: 'var(--primary-dark)', marginBottom: '1.5rem', fontSize: '1.8rem', fontWeight: 800 }}>
                                        {currentSectionTitle}
                                    </h2>
                                    <div ref={markdownViewRef} className="document-content-layer" />
                                </>
                            ) : (
                                <div ref={markdownViewRef} style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: '1.6' }}>
                                    {`# ${currentSectionTitle}\n${htmlContent}`}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={`card ${styles.highlightsCard}`}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardIcon} style={{color: '#00B8D9', background: 'rgba(0, 184, 217, 0.1)'}}><i className="fas fa-highlighter"></i></div>
                        <h2 style={{fontSize: '1.4rem', fontWeight: 700, margin: 0}}>Highlights</h2>
                    </div>

                    <div className={styles.panelLayout}>
                        <div className={styles.panelControls}>
                            <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                                <button className={styles.btnPrimary} style={{flex: 2}} onClick={saveHighlights}><i className="fas fa-cloud-upload-alt"></i> Save All</button>
                                <button className={styles.toggleViewBtn} style={{flex: 1}} onClick={exportHighlights} title="Export as Markdown"><i className="fas fa-download"></i></button>
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
                            <div className={styles.statusMessage} style={{color: statusMsg.includes('Error') ? '#FFAB00' : '#4CAF50', fontWeight: 600}}>{statusMsg}</div>
                        </div>

                        <div className={styles.highlightsList}>
                            {filteredHighlights.length === 0 ? (
                                <div style={{textAlign: 'center', padding: '40px 10px', color: '#ccc'}}>
                                    <i className="fas fa-feather-alt" style={{fontSize: '2rem', marginBottom: '10px', opacity: 0.3}}></i>
                                    <p style={{fontSize: '0.9rem'}}>{searchQuery ? 'No results found' : 'Highlight text to see it here'}</p>
                                </div>
                            ) : (
                                filteredHighlights.map(h => (
                                    <div key={h.id} className={styles.highlightItem} onClick={() => scrollToHighlight(h.id)} style={{cursor: 'pointer'}}>
                                        <div className={styles.highlightHeader}>
                                            <span className={styles.sectionTitle}>{h.sectionTitle}</span>
                                            <div className="item-actions">
                                                <button className="tool-btn" onClick={(e) => {e.stopPropagation(); speakText(h.id, h.text);}} title="Listen">
                                                    <i className={`fas ${speakingId === h.id ? 'fa-stop-circle' : 'fa-volume-up'}`} style={{color: speakingId === h.id ? '#00B8D9' : ''}}></i>
                                                </button>
                                                <button className="tool-btn" onClick={(e) => {e.stopPropagation(); copyToClipboard(h.id, h.text);}} title="Copy">
                                                    <i className={`fas ${copiedId === h.id ? 'fa-check' : 'fa-copy'}`} style={{color: copiedId === h.id ? '#27c93f' : ''}}></i>
                                                </button>
                                                <button className={styles.removeBtn} onClick={(e) => {e.stopPropagation(); handleLocalRemoveHighlight(h.id);}} title="Delete">
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
            </div>
        </div>
    );
}