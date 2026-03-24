import React, { memo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import styles from '../../../styles/AIInteract.module.css';

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

const MessageItem = memo(({ msg, isUser, onCopy, isLastAssistant, onRegenerate, onEdit, isTyping }) => {
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

    const renderContent = (content) => {
        if (!content) return { __html: "" };
        try {
            const rawHtml = typeof marked.parse === 'function' ? marked.parse(content) : marked(content);
            const cleanHtml = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ['class', 'data-code'],
                ADD_TAGS: ['button', 'i', 'span']
            });
            return { __html: cleanHtml };
        } catch (error) {
            return { __html: `<p style="color:red">Render Error: ${content}</p>` };
        }
    };

    return (
        <div className={`${styles.message} ${isUser ? styles['user-message'] : styles['ai-message']}`}>
            <div className={styles.avatar}>
                <i className={`fas ${isUser ? 'fa-user' : 'fa-robot'}`}></i>
            </div>

            {isUser ? (
                <div className={styles.bubble} style={{ minHeight: '20px', position: 'relative' }}>
                    {msg.files && msg.files.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: msg.content ? '8px' : '0' }}>
                            {msg.files.map((f, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className={f.mime_type.startsWith('image') ? 'fas fa-image' : 'fas fa-file-alt'}></i>
                                    {f.file_name}
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
                                style={{ width: '100%', minWidth: '300px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', padding: '8px', fontFamily: 'inherit', resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button onClick={handleCancelEdit} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', opacity: 0.8, fontSize: '13px' }}>Cancel</button>
                                <button onClick={handleSaveEdit} disabled={!editVal.trim()} style={{ background: '#fff', color: '#007B55', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Save & Resend</button>
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
}, (prevProps, nextProps) => {
    return prevProps.msg.content === nextProps.msg.content &&
        prevProps.msg.role === nextProps.msg.role &&
        prevProps.isTyping === nextProps.isTyping &&
        prevProps.isLastAssistant === nextProps.isLastAssistant &&
        JSON.stringify(prevProps.msg.files) === JSON.stringify(nextProps.msg.files);
});

export default MessageItem;