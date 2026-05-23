import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import styles from '../styles/AIMessage.module.css';
import type { RagCitation } from '../../../types/api';
import { useTypewriter } from '../hooks/useTypewriter';
import { getFileIcon, getFileIconColor } from '../utils/fileUtils';

// --- Initialise the Markdown renderer once at module level ---
const renderer = new marked.Renderer();
renderer.code = function (token) {
    const codeText = typeof token === 'object' ? token.text : String(token);
    const langText = typeof token === 'object' ? token.lang : undefined;
    const safeCode = codeText || '';
    const validLang = langText && hljs.getLanguage(langText) ? langText : 'plaintext';
    let highlighted = '';
    try {
        highlighted = validLang === 'plaintext'
            ? hljs.highlightAuto(safeCode).value
            : hljs.highlight(safeCode, { language: validLang }).value;
    } catch (e) {
        highlighted = safeCode;
    }
    return `
        <div class="code-block-wrapper">
            <div class="code-block-header">
                <div class="code-header-left">
                    <div class="code-block-mac-dots"><span></span><span></span><span></span></div>
                    <span class="code-lang-text">${validLang}</span>
                </div>
                <button class="code-copy-btn js-code-copy-btn" data-code="${encodeURIComponent(safeCode)}">
                    <i class="far fa-copy"></i> Copy code
                </button>
            </div>
            <pre><code class="hljs language-${validLang}">${highlighted}</code></pre>
        </div>
    `;
};
marked.use({ breaks: true, renderer });

/* ── Citation panel — shows RAG sources used for the response ── */
function CitationPanel({ citations, isCourseRelevant }: { citations: RagCitation[]; isCourseRelevant?: boolean }) {
    const [expanded, setExpanded] = useState(false);

    const localCitations = citations.filter(c => c.source_type !== 'web');
    const webCitations   = citations.filter(c => c.source_type === 'web');

    // Only show the panel when the reply is genuinely course-grounded OR has web results
    const shouldShow = isCourseRelevant || webCitations.length > 0;
    if (!shouldShow) return null;

    const totalCount = (isCourseRelevant ? localCitations.length : 0) + webCitations.length;

    return (
        <div className={styles.citationsWrap}>
            <button
                className={styles.citationsToggle}
                onClick={() => setExpanded(v => !v)}
            >
                <i className="fas fa-book-open" /> {totalCount} source{totalCount !== 1 ? 's' : ''}
                <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} style={{ marginLeft: 4, fontSize: '0.7rem' }} />
            </button>

            {expanded && (
                <div className={styles.citationsList}>
                    {/* ── Local course documents ── */}
                    {isCourseRelevant && localCitations.length > 0 && (
                        <>
                            <div className={styles.citationsGroupHeader}>
                                <i className="fas fa-graduation-cap" /> Course Materials
                            </div>
                            {localCitations.map(c => (
                                <div key={c.index} className={styles.citationCard}>
                                    <div className={styles.citationDoc}>
                                        <i className="fas fa-file-alt" />
                                        <span className={styles.citationDocName} title={c.doc_name || 'Unknown'}>
                                            {c.doc_name || 'Unknown'}
                                        </span>
                                    </div>
                                    <span className={styles.citationScore}>{(c.score * 100).toFixed(0)}%</span>
                                </div>
                            ))}
                        </>
                    )}

                    {/* ── Web results ── */}
                    {webCitations.length > 0 && (
                        <>
                            <div className={`${styles.citationsGroupHeader} ${styles.citationsGroupHeaderWeb}`}>
                                <i className="fas fa-globe" /> Web Results
                            </div>
                            {webCitations.map(c => (
                                <div key={c.index} className={`${styles.citationCard} ${styles.citationCardWeb}`}>
                                    <div className={styles.citationDoc}>
                                        <i className="fas fa-globe" />
                                        {c.url ? (
                                            <a
                                                href={c.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.citationWebLink}
                                                title={c.doc_name || c.url}
                                            >
                                                <span className={styles.citationDocName}>{c.doc_name || c.url}</span>
                                                <i className="fas fa-external-link-alt" style={{ fontSize: '0.6rem', flexShrink: 0 }} />
                                            </a>
                                        ) : (
                                            <span className={styles.citationDocName}>{c.doc_name || 'Unknown'}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── LRU render cache: avoids re-parsing identical text across re-renders ──
// Key = full content string, Value = sanitised HTML object.
// Max 150 entries; oldest entry evicted when full.
const _renderCache = new Map<string, { __html: string }>();
const _RENDER_CACHE_MAX = 150;

/* ── Module-level markdown renderer — no closure deps, never recreated ── */
function renderContent(content: string): { __html: string } {
    if (!content) return { __html: '' };
    const hit = _renderCache.get(content);
    if (hit) return hit;
    try {
        const rawHtml = marked.parse(content) as string;
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ADD_ATTR: ['class', 'data-code'],
            ADD_TAGS: ['button', 'i', 'span'],
        });
        const result = { __html: cleanHtml };
        if (_renderCache.size >= _RENDER_CACHE_MAX) {
            _renderCache.delete(_renderCache.keys().next().value!);
        }
        _renderCache.set(content, result);
        return result;
    } catch (error) {
        const safeText = DOMPurify.sanitize(content);
        return { __html: `<p style="color:red">Render Error: ${safeText}</p>` };
    }
}

/* ── AI message bubble with typewriter animation ── */
function AIMessageBubble({ content, reasoning, citations, isCourseRelevant, isTyping, isLastAssistant, onCopy, onRegenerate }: {
    content: string;
    reasoning?: string;
    citations?: RagCitation[];
    isCourseRelevant?: boolean;
    isTyping: boolean;
    isLastAssistant: boolean;
    onCopy: (text: string, el: HTMLElement | null) => void;
    onRegenerate: () => void;
}) {
    const isStreaming = isTyping && isLastAssistant;
    const displayed = useTypewriter(content, isStreaming);
    const stillTyping = isStreaming || displayed !== content;

    // ── Throttled Markdown rendering ────────────────────────────────────────
    // `displayed` changes every rAF frame (~16ms) during streaming.
    // Running marked.parse + DOMPurify on every frame causes long tasks.
    // Fix: commit a new render at most every 50ms during streaming;
    //      render immediately when streaming ends.
    const [renderedHtml, setRenderedHtml] = useState<{ __html: string }>(
        () => renderContent(isStreaming ? '' : displayed)
    );
    const latestDisplayedRef = useRef(displayed);
    latestDisplayedRef.current = displayed;
    const renderScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRenderedLenRef = useRef(0);

    useEffect(() => {
        if (!isStreaming) {
            // Streaming ended — cancel throttle timer and render immediately
            if (renderScheduledRef.current != null) {
                clearTimeout(renderScheduledRef.current);
                renderScheduledRef.current = null;
            }
            setRenderedHtml(renderContent(displayed));
            lastRenderedLenRef.current = displayed.length;
            return;
        }
        // Adaptive throttle: fewer renders as content grows
        // <500 chars → 80ms, <2000 → 150ms, else → 300ms
        const len = displayed.length;
        const interval = len < 500 ? 80 : len < 2000 ? 150 : 300;

        if (renderScheduledRef.current == null) {
            renderScheduledRef.current = setTimeout(() => {
                renderScheduledRef.current = null;
                const current = latestDisplayedRef.current;
                // Skip render if only a few chars arrived (except very short content)
                if (current.length - lastRenderedLenRef.current < 50 && current.length >= 100) return;
                setRenderedHtml(renderContent(current));
                lastRenderedLenRef.current = current.length;
            }, interval);
        }
    }, [displayed, isStreaming]);

    // Cleanup pending timer on unmount
    useEffect(() => () => {
        if (renderScheduledRef.current != null) clearTimeout(renderScheduledRef.current);
    }, []);

    const hasReasoning = reasoning && reasoning.length > 0;
    const [reasoningCollapsed, setReasoningCollapsed] = useState(false);

    return (
        <div className={`${styles.bubble} markdown-body`} style={{ minHeight: '20px' }}>
            {/* ── Reasoning / Think box ── */}
            {hasReasoning && (
                <div className={`${styles['reasoning-box']} ${(content && !isStreaming) ? styles['reasoning-done'] : ''} ${reasoningCollapsed ? styles['reasoning-collapsed'] : ''}`}>
                    <button
                        className={styles['reasoning-toggle']}
                        onClick={() => setReasoningCollapsed(v => !v)}
                    >
                        <span className={styles['reasoning-toggle-icon']}>
                            {isStreaming && !content ? (
                                <span className={styles['thinking-spinner']}>
                                    <span className={styles.dot}></span>
                                    <span className={styles.dot}></span>
                                    <span className={styles.dot}></span>
                                </span>
                            ) : (
                                <i className="fas fa-brain" />
                            )}
                        </span>
                        <span className={styles['reasoning-toggle-label']}>
                            {isStreaming && !content ? '深度思考中...' : '已完成深度思考'}
                        </span>
                        <i className={`fas fa-chevron-${reasoningCollapsed ? 'down' : 'up'}`} style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.6 }} />
                    </button>
                    {!reasoningCollapsed && (
                        <div className={styles['reasoning-content']}>
                            <span className={styles['reasoning-text']}>
                                {reasoning}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {displayed === '' ? (
                hasReasoning ? null : <div style={{ color: '#999', fontStyle: 'italic' }}></div>
            ) : (
                <>
                    <div dangerouslySetInnerHTML={renderedHtml} />
                    {stillTyping && <span className={styles['typing-cursor']} />}
                </>
            )}
            {/* RAG Citations — smart display */}
            {citations && citations.length > 0 && (
                <CitationPanel citations={citations} isCourseRelevant={isCourseRelevant} />
            )}
            {content && (
                <div className={styles['message-actions']}>
                    <button className={styles['msg-action-btn']} onClick={(e) => onCopy(content, e.currentTarget)}>
                        <i className="far fa-copy"></i> Copy text
                    </button>
                    {isLastAssistant && !isTyping && (
                        <button className={styles['msg-action-btn']} onClick={onRegenerate}>
                            <i className="fas fa-sync-alt"></i> Regenerate
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

interface MessageItemProps {
    msg: {
        role: string;
        content: string;
        reasoning?: string;
        images?: string[];
        files?: { file_name: string; mime_type: string }[];
        citations?: RagCitation[];
    };
    idx: number;
    isUser: boolean;
    onCopy: (text: string, el: HTMLElement | null) => void;
    isLastAssistant: boolean;
    onRegenerate: (idx: number) => void;
    onEdit: (idx: number, newVal: string) => void;
    isTyping: boolean;
}

const MessageItem = memo(({ msg, idx, isUser, onCopy, isLastAssistant, onRegenerate, onEdit, isTyping }: MessageItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(msg.content);

    const handleRegen = useCallback(() => onRegenerate(idx), [idx, onRegenerate]);
    const handleEdit = useCallback((v: string) => onEdit(idx, v), [idx, onEdit]);

    const handleSaveEdit = () => {
        if (editVal.trim()) {
            handleEdit(editVal);
        }
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditVal(msg.content);
        setIsEditing(false);
    };

    return (
        <div className={`${styles.message} ${isUser ? styles['user-message'] : styles['ai-message']}`}>
            <div className={styles.avatar}>
                <i className={`fas ${isUser ? 'fa-user' : 'fa-robot'}`}></i>
            </div>

            {isUser ? (
                <div className={styles.bubble} style={{ minHeight: '20px', position: 'relative' }}>
                    {msg.images && msg.images.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            {msg.images.map((base64, i) => (
                                <img
                                    key={i}
                                    src={`data:image/jpeg;base64,${base64}`}
                                    alt="attachment"
                                    style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '6px', objectFit: 'contain', background: 'rgba(255,255,255,0.2)' }}
                                />
                            ))}
                        </div>
                    )}
                    {msg.files && msg.files.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: msg.content ? '8px' : '0' }}>
                            {msg.files.map((f, i) => {
                                const iconColorClass = styles[getFileIconColor(f.mime_type)] || '';
                                return (
                                    <div key={i} className={styles.fileCard} title={f.file_name}>
                                        <div className={`${styles.fileCardIconWrap} ${iconColorClass}`}>
                                            <i className={`fas ${getFileIcon(f.mime_type)}`}></i>
                                        </div>
                                        <div className={styles.fileCardInfo}>
                                            <span className={styles.fileCardName}>{f.file_name}</span>
                                            <span className={styles.fileCardSize}>Document</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {isEditing ? (
                        <div className={styles['edit-box']}>
                            <textarea
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                autoFocus
                                className={styles['edit-textarea']}
                                rows={Math.max(2, editVal.split('\n').length)}
                            />
                            <div className={styles['edit-actions']}>
                                <button className={styles['edit-btn-cancel']} onClick={handleCancelEdit}>Cancel</button>
                                <button className={styles['edit-btn-save']} onClick={handleSaveEdit} disabled={!editVal.trim()}>
                                    <i className="fas fa-paper-plane"></i> Save & Resend
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles['message-content-display']}>
                            {msg.content}
                            {!isTyping && (
                                <div className={styles['user-message-actions']}>
                                    <button className={styles['msg-action-btn']} onClick={() => setIsEditing(true)}>
                                        <i className="fas fa-edit"></i>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <AIMessageBubble
                    content={msg.content}
                    reasoning={(msg as any).reasoning}
                    citations={msg.citations}
                    isCourseRelevant={(msg as any).is_course_relevant}
                    isTyping={isTyping}
                    isLastAssistant={isLastAssistant}
                    onCopy={onCopy}
                    onRegenerate={handleRegen}
                />
            )}
        </div>
    );
}, (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    if (prevProps.msg.content !== nextProps.msg.content) return false;
    if (prevProps.msg.role !== nextProps.msg.role) return false;
    if ((prevProps.msg as any).reasoning !== (nextProps.msg as any).reasoning) return false;
    if (prevProps.isTyping !== nextProps.isTyping) return false;
    if (prevProps.isLastAssistant !== nextProps.isLastAssistant) return false;
    // Shallow reference checks — arrays are set once per message and never mutated
    if (prevProps.msg.images !== nextProps.msg.images) return false;
    if (prevProps.msg.files !== nextProps.msg.files) return false;
    if (prevProps.msg.citations !== nextProps.msg.citations) return false;
    return true;
});

export default MessageItem;