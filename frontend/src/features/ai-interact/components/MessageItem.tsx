import React, { memo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import styles from '../styles/AIInteract.module.css';
import type { RagCitation } from '../../../types/api';

// --- 全局只初始化一次 Markdown 渲染器 ---
const renderer = new marked.Renderer();
renderer.code = function (token) {
    const codeText = typeof token === 'object' ? token.text : token;
    const langText = typeof token === 'object' ? token.lang : arguments[1];
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
marked.setOptions({ breaks: true, renderer });

/* ── Citation panel — shows RAG sources used for the response ── */
function CitationPanel({ citations }: { citations: RagCitation[] }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div style={{
            marginTop: '12px', padding: '8px 12px', borderRadius: '8px',
            background: 'rgba(0,123,85,0.06)', border: '1px solid rgba(0,123,85,0.15)',
            fontSize: '12px', color: '#4b5563',
        }}>
            <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, color: '#007B55' }}
                onClick={() => setExpanded(v => !v)}
            >
                <i className="fas fa-book-open" style={{ fontSize: '11px' }} />
                Sources ({citations.length})
                <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: '10px', marginLeft: 'auto' }} />
            </div>
            {expanded && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {citations.map(c => (
                        <div key={c.index} style={{
                            padding: '6px 8px', borderRadius: '6px', background: '#fff',
                            border: '1px solid #e5e7eb', fontSize: '11px',
                        }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 600, color: '#111' }}>{c.doc_name || 'Unknown'}</span>
                                <span style={{ color: '#9ca3af' }}>score: {c.score.toFixed(2)}</span>
                                <span style={{ color: '#9ca3af' }}>course: {c.course_id}</span>
                            </div>
                            <div style={{ color: '#6b7280', lineHeight: 1.4, maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {c.text.slice(0, 200)}{c.text.length > 200 ? '…' : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface MessageItemProps {
    msg: {
        role: string;
        content: string;
        images?: string[];
        files?: { file_name: string; mime_type: string }[];
        citations?: RagCitation[];
    };
    isUser: boolean;
    onCopy: (text: string, el: HTMLElement | null) => void;
    isLastAssistant: boolean;
    onRegenerate: () => void;
    onEdit: (newVal: string) => void;
    isTyping: boolean;
}

const MessageItem = memo(({ msg, isUser, onCopy, isLastAssistant, onRegenerate, onEdit, isTyping }: MessageItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(msg.content);

    const handleSaveEdit = () => {
        if (editVal.trim() && editVal !== msg.content) {
            onEdit(editVal);
        }
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditVal(msg.content);
        setIsEditing(false);
    };

    const renderContent = (content: string) => {
        if (!content) return { __html: "" };
        try {
            const rawHtml = typeof marked.parse === 'function' ? marked.parse(content) as string : marked(content) as string;
            const cleanHtml = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ['class', 'data-code'],
                ADD_TAGS: ['button', 'i', 'span']
            });
            return { __html: cleanHtml };
        } catch (error) {
            return { __html: `<p style="color:red">Render Error: ${content}</p>` };
        }
    };

    const getFileIcon = (mimeType?: string) => {
        if (!mimeType) return 'fa-file-alt';
        if (mimeType.startsWith('image/')) return 'fa-file-image';
        if (mimeType === 'application/pdf') return 'fa-file-pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint';
        if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar')) return 'fa-file-archive';
        if (mimeType.includes('markdown') || mimeType.includes('text/md')) return 'fa-file-code';
        return 'fa-file-alt';
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
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: msg.content ? '8px' : '0' }}>
                            {msg.files.map((f, i) => (
                                <div key={i} className={styles.fileCard} title={f.file_name}>
                                    <i className={`fas ${getFileIcon(f.mime_type)} ${styles.fileCardIcon}`}></i>
                                    <div className={styles.fileCardInfo}>
                                        <span className={styles.fileCardName}>{f.file_name}</span>
                                        <span className={styles.fileCardSize}>Document</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {isEditing ? (
                        <div className={styles['edit-box']}>
                            <textarea
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                autoFocus
                                rows={Math.max(2, editVal.split('\n').length)}
                                style={{ width: '100%', minWidth: '300px', background: '#ffffff', color: '#1f1f1f', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '8px', padding: '10px', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button onClick={handleCancelEdit} style={{ background: 'transparent', color: '#4b5563', border: 'none', cursor: 'pointer', opacity: 0.8, fontSize: '13px' }}>Cancel</button>
                                <button onClick={handleSaveEdit} disabled={!editVal.trim()} style={{ background: '#007B55', color: '#fff', border: 'none', padding: '4px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Save & Resend</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {msg.content}
                            {!isTyping && (
                                <div className={styles['user-message-actions']}>
                                    <button className={styles['msg-action-btn']} onClick={() => setIsEditing(true)}>
                                        <i className="fas fa-edit"></i>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : (
                <div className={`${styles.bubble} markdown-body`} style={{ minHeight: '20px' }}>
                    {msg.content === "" ? (
                        <div style={{ color: '#999', fontStyle: 'italic' }}></div>
                    ) : (
                        <div dangerouslySetInnerHTML={renderContent(msg.content)} />
                    )}
                    {/* RAG Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                        <CitationPanel citations={msg.citations} />
                    )}
                    {msg.content && (
                        <div className={styles['message-actions']}>
                            <button className={styles['msg-action-btn']} onClick={(e) => onCopy(msg.content, e.currentTarget)}>
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
            )}
        </div>
    );
}, (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    return prevProps.msg.content === nextProps.msg.content &&
        prevProps.msg.role === nextProps.msg.role &&
        prevProps.isTyping === nextProps.isTyping &&
        prevProps.isLastAssistant === nextProps.isLastAssistant &&
        JSON.stringify(prevProps.msg.images) === JSON.stringify(nextProps.msg.images) &&
        JSON.stringify(prevProps.msg.files) === JSON.stringify(nextProps.msg.files) &&
        JSON.stringify(prevProps.msg.citations) === JSON.stringify(nextProps.msg.citations);
});

export default MessageItem;