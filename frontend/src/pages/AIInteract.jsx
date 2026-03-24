import React, { memo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
// 引入 CSS Modules
import styles from '../styles/AIInteract.module.css';

import 'highlight.js/styles/github-dark.css';

// --- Markdown 渲染配置 ---
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
marked.setOptions({ breaks: true, renderer: renderer });

// --- 消息气泡组件 ---
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
            let rawHtml = "";
            if (typeof marked.parse === 'function') {
                rawHtml = marked.parse(content);
            } else if (typeof marked === 'function') {
                rawHtml = marked(content);
            } else {
                rawHtml = `<p>${content}</p>`;
            }

            const cleanHtml = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ['class', 'data-code'],
                ADD_TAGS: ['button', 'i', 'span']
            });
            return { __html: cleanHtml };
        } catch (error) {
            console.error("Markdown渲染失败:", error);
            return { __html: `<p style="color:red">渲染错误，原始内容: ${content}</p>` };
        }
    };

    return (
        <div className={`${styles.message} ${isUser ? styles['user-message'] : styles['ai-message']}`}>
            <div className={styles.avatar}>
                <i className={`fas ${isUser ? 'fa-user' : 'fa-robot'}`}></i>
            </div>

            {isUser ? (
                <div className={styles.bubble} style={{ minHeight: '20px', position: 'relative' }}>
                    {/* 渲染用户附带的文件 */}
                    {msg.files && msg.files.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: msg.content ? '8px' : '0' }}>
                            {msg.files.map((f, i) => (
                                <div key={i} style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
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

// --- 主 UI 组件 ---
function AIInteract({
    sessions, setSessions, currentSessionId, inputText, setIsTyping, isTyping, modalConfig, toastVisible,
    chatMessagesRef, inputRef, createNewSession, deleteSession, confirmDelete,
    setModalConfig, handleInput, handleKeyDown, handleSend, copyToClipboard, handleChatAreaClick, deletingId,
    abortControllerRef, handleStop,
    // 新增的文件上传相关 Props
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile,
}) {
    const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
    const lastMessage = currentSession?.messages[currentSession.messages.length - 1];

    // Provide safe fallbacks if parent does not supply attachment-related props
    const fallbackFileRef = useRef(null);
    const fallbackAbortRef = useRef(null);
    const safeFileInputRef = fileInputRef || fallbackFileRef;
    const safeHandleFileChange = handleFileChange || (() => { });
    const safeRemoveAttachedFile = removeAttachedFile || (() => { });
    const safeAttachedFiles = attachedFiles || [];
    const safeIsUploadingFile = isUploadingFile || false;
    const safeAbortControllerRef = abortControllerRef || fallbackAbortRef;
    const safeHandleStop = handleStop || (() => {
        if (safeAbortControllerRef.current) {
            safeAbortControllerRef.current.abort();
            safeAbortControllerRef.current = null;
        }
        setIsTyping(false);
    });

    const handleRegenerate = async (msgIndex) => {
        if (isTyping) return;
        const targetId = currentSessionId;
        const currentSess = sessions.find(s => s.id === targetId);
        if (!currentSess) return;

        // Cancel any in-flight stream first
        if (safeAbortControllerRef.current) safeAbortControllerRef.current.abort();
        safeAbortControllerRef.current = new AbortController();

        // Ensure msgIndex points to an assistant message, we will find the corresponding user message before it.
        let mForAPI = currentSess.messages.slice(0, msgIndex);

        setIsTyping(true);
        // Clear out the current assistant message and subsequent ones to "regenerate"
        setSessions(prev => prev.map(s => {
            if (s.id === targetId) return { ...s, messages: [...mForAPI, { role: "assistant", content: "" }] };
            return s;
        }));

        try {
            // Strip out `files` arrays from the message history as well since your API likely only wants role/content
            const apiMessages = mForAPI.filter(m => m.role !== 'system' || mForAPI.length < 5).map(m => {
                const apiMsg = { role: m.role, content: m.content };
                if (m.files && m.files.length > 0) {
                    apiMsg.files = m.files;
                }
                return apiMsg;
            });

            const response = await fetch('http://localhost:5009/api/ai/chat', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: apiMessages }),
                signal: safeAbortControllerRef.current.signal,
            });

            if (!response.ok) {
                setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...mForAPI, { role: "assistant", content: `API Error: ${response.status}` }] } : s));
                setIsTyping(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let aiFullResponse = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                let boundary = buffer.indexOf('\n');

                while (boundary !== -1) {
                    const line = buffer.slice(0, boundary).trim();
                    buffer = buffer.slice(boundary + 1);
                    boundary = buffer.indexOf('\n');

                    if (!line || !line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') continue;

                    try {
                        const dataObj = JSON.parse(dataStr);
                        if (dataObj.error) aiFullResponse += `\n\n**[Error]**: ${dataObj.error}`;
                        else if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                            aiFullResponse += dataObj.choices[0].delta.content;
                        }

                        setSessions(prevSessions => prevSessions.map(s => {
                            if (s.id !== targetId) return s;
                            const newMsgs = [...s.messages];
                            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: aiFullResponse };
                            return { ...s, messages: newMsgs };
                        }));
                    } catch (e) {
                        // ignore unparseable chunks wait for next boundary
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                // Stopped by user
                return;
            }
            setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...mForAPI, { role: "assistant", content: `Network Error: ${error.message}` }] } : s));
        } finally {
            setIsTyping(false);
            safeAbortControllerRef.current = null;
        }
    };

    const handleEditUserMsg = (msgIndex, newText) => {
        if (isTyping) return;
        const targetId = currentSessionId;
        const currentSess = sessions.find(s => s.id === targetId);
        if (!currentSess) return;

        if (safeAbortControllerRef.current) safeAbortControllerRef.current.abort();
        safeAbortControllerRef.current = new AbortController();

        // Get everything up to the user msg
        const newHistory = currentSess.messages.slice(0, msgIndex);
        const originalUserMsg = currentSess.messages[msgIndex];

        setIsTyping(true);
        // Replace with new user msg, and clear out everything after to regenerate
        const updatedUserMsg = { ...originalUserMsg, content: newText };
        setSessions(prev => prev.map(s => {
            if (s.id === targetId) return { ...s, messages: [...newHistory, updatedUserMsg, { role: "assistant", content: "" }] };
            return s;
        }));

        let mForAPI = [...newHistory, updatedUserMsg];

        (async () => {
            try {
                const apiMessages = mForAPI.filter(m => m.role !== 'system' || mForAPI.length < 5).map(m => {
                    const apiMsg = { role: m.role, content: m.content };
                    if (m.files && m.files.length > 0) apiMsg.files = m.files;
                    return apiMsg;
                });
                const response = await fetch('http://localhost:5009/api/ai/chat', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: apiMessages }),
                    signal: safeAbortControllerRef.current.signal,
                });

                if (!response.ok) {
                    setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...mForAPI, { role: "assistant", content: `API Error: ${response.status}` }] } : s));
                    setIsTyping(false);
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let aiFullResponse = "";
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;
                    let boundary = buffer.indexOf('\n');

                    while (boundary !== -1) {
                        const line = buffer.slice(0, boundary).trim();
                        buffer = buffer.slice(boundary + 1);
                        boundary = buffer.indexOf('\n');

                        if (!line || !line.startsWith('data: ')) continue;
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') continue;

                        try {
                            const dataObj = JSON.parse(dataStr);
                            if (dataObj.error) aiFullResponse += `\n\n**[Error]**: ${dataObj.error}`;
                            else if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                                aiFullResponse += dataObj.choices[0].delta.content;
                            }

                            setSessions(prevSessions => prevSessions.map(s => {
                                if (s.id !== targetId) return s;
                                const newMsgs = [...s.messages];
                                newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: aiFullResponse };
                                return { ...s, messages: newMsgs };
                            }));
                        } catch (e) {
                            // ignore unparseable chunks wait for next boundary
                        }
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...mForAPI, { role: "assistant", content: `Network Error: ${error.message}` }] } : s));
            } finally {
                setIsTyping(false);
                safeAbortControllerRef.current = null;
            }
        })();
    };

    return (
        <>
            <div className={`global-ai-wrapper ${styles['ai-workspace-wrapper']}`}>
                <div className={styles['workspace-glow']}></div>

                <div className={styles['ai-workspace-container']}>
                    {/* 左侧栏 */}
                    <aside className={styles['chat-sidebar']}>
                        <button className={styles['new-chat-btn']} onClick={() => createNewSession(true)}>
                            <i className="fas fa-plus"></i> New Chat
                        </button>
                        <div className={styles['sidebar-title']}>Recent Conversations</div>
                        <div className={styles['history-list']}>
                            {sessions.map((session, idx) => (
                                <div key={session.id || `sess-${idx}`} className={`${styles['history-item']} ${session.id === currentSessionId ? styles.active : ''} ${session.id === deletingId ? styles.deleting : ''}`}>
                                    <div className={styles['history-item-content']} onClick={() => createNewSession(false, session.id)}>
                                        <i className="far fa-comment-alt"></i>
                                        <span className={styles['history-text']}>{session.title}</span>
                                    </div>
                                    <button className={styles['delete-chat-btn']} onClick={(e) => deleteSession(e, session.id)} title="Delete Chat">
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className={styles['sidebar-footer']}>
                            <div className={styles['user-status']}>
                                <div className={styles['status-dot']}></div>
                                <span>HKU Coze AI Ready</span>
                            </div>
                        </div>
                    </aside>

                    {/* 右侧主聊天区 */}
                    <main className={styles['chat-main']}>
                        <header className={styles['chat-main-header']}>
                            <div className={styles['header-info']}>
                                <h2><i className="fas fa-sparkles"></i> HKU Coze AI Assistant</h2>
                                <p>Advanced Academic Model</p>
                            </div>
                            <Link to="/" className={styles['back-home-btn']}>
                                <i className="fas fa-sign-out-alt"></i> Exit Workspace
                            </Link>
                        </header>

                        <div className={`${styles['chat-messages']} ${styles['full-workspace']}`} ref={chatMessagesRef} onClick={handleChatAreaClick}>
                            {currentSession?.messages.length === 1 && (
                                <div className={`${styles.message} ${styles['ai-message']}`}>
                                    <div className={styles.avatar}><i className="fas fa-robot"></i></div>
                                    <div className={styles.bubble}>Hello! I'm your HKU AI Assistant. I can help you with academic research, code explanation, or generating course materials. What would you like to explore today?</div>
                                </div>
                            )}

                            {currentSession?.messages.map((msg, idx) => {
                                if (msg.role === 'system') return null;
                                if (msg.role === 'assistant' && !msg.content) return null;
                                const isUser = msg.role === 'user';
                                const isLastAssistant = idx === currentSession.messages.length - 1 && msg.role === 'assistant';
                                return (
                                    <MessageItem
                                        key={`${currentSession.id}-${idx}`}
                                        msg={msg}
                                        isUser={isUser}
                                        onCopy={copyToClipboard}
                                        isLastAssistant={isLastAssistant}
                                        onRegenerate={() => handleRegenerate(idx)}
                                        onEdit={(newVal) => handleEditUserMsg(idx, newVal)}
                                        isTyping={isTyping}
                                    />
                                );
                            })}

                            {isTyping && (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) && (
                                <div className={`${styles.message} ${styles['ai-message']} ${styles['typing-indicator-msg']}`}>
                                    <div className={styles.avatar}><i className="fas fa-robot"></i></div>
                                    <div className={`${styles.bubble} ${styles['typing-bubble']}`} style={{ padding: '12px 20px' }}>
                                        <div className={styles['typing-dots']} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span style={{ width: '6px', height: '6px', background: '#007B55', borderRadius: '50%', animation: 'bounce 1.4s infinite -0.32s' }}></span>
                                            <span style={{ width: '6px', height: '6px', background: '#007B55', borderRadius: '50%', animation: 'bounce 1.4s infinite -0.16s' }}></span>
                                            <span style={{ width: '6px', height: '6px', background: '#007B55', borderRadius: '50%', animation: 'bounce 1.4s infinite' }}></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 底部输入框 */}
                        <div className={styles['input-area']}>
                            {/* 附件预览区 */}
                            {safeAttachedFiles && safeAttachedFiles.length > 0 && (
                                <div style={{ display: 'flex', gap: '10px', padding: '0 15px 10px', flexWrap: 'wrap' }}>
                                    {safeAttachedFiles.map((file, idx) => (
                                        <div key={idx} style={{
                                            background: '#f1f3f5',
                                            padding: '6px 12px',
                                            borderRadius: '16px',
                                            fontSize: '13px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            color: '#333',
                                            border: '1px solid #dee2e6'
                                        }}>
                                            <i className={file.mime_type.startsWith('image') ? 'fas fa-image' : 'fas fa-file-alt'} style={{ color: '#007B55' }}></i>
                                            <span style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {file.file_name}
                                            </span>
                                            <i className="fas fa-times"
                                                style={{ cursor: 'pointer', color: '#868e96', marginLeft: '4px' }}
                                                onClick={() => safeRemoveAttachedFile(idx)}
                                                title="Remove attachment"
                                            ></i>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className={styles['input-wrapper']} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* 隐藏的文件上传 Input */}
                                <input
                                    type="file"
                                    ref={safeFileInputRef}
                                    style={{ display: 'none' }}
                                    accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    onChange={safeHandleFileChange}
                                />

                                {/* 附件上传按钮 */}
                                <button
                                    type="button"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '20px',
                                        color: '#6b7280',
                                        cursor: isTyping || safeIsUploadingFile ? 'not-allowed' : 'pointer',
                                        padding: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => safeFileInputRef.current && safeFileInputRef.current.click()}
                                    disabled={isTyping || safeIsUploadingFile}
                                    title="Attach File (Image, PDF, DOCX)"
                                >
                                    {safeIsUploadingFile ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paperclip"></i>}
                                </button>

                                <textarea
                                    className={styles['workspace-input']}
                                    ref={inputRef} rows="1"
                                    placeholder="Type your academic query or attach a file... (Press Enter to send)"
                                    value={inputText} onChange={handleInput} onKeyDown={handleKeyDown}
                                    data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                                    style={{ flex: 1 }}
                                ></textarea>

                                <button className={styles['send-btn']} onClick={handleSend} disabled={isTyping || safeIsUploadingFile}>
                                    <i className="fas fa-paper-plane"></i>
                                </button>

                                <button
                                    className={styles['stop-btn']}
                                    onClick={safeHandleStop}
                                    disabled={!isTyping}
                                    title="Stop AI output"
                                >
                                    <i className="fas fa-stop"></i>
                                </button>
                            </div>
                            <div className={styles['input-footer-text']}>
                                AI can make mistakes. Consider verifying important academic information.
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* 删除确认弹窗 */}
            {modalConfig.show && (
                <div className={`${styles['custom-modal-overlay']} ${styles.show}`} onClick={(e) => {
                    if (e.target.className.includes(styles['custom-modal-overlay'])) setModalConfig({ show: false, sessionId: null })
                }}>
                    <div className={styles['custom-modal-box']}>
                        <div className={styles['modal-icon']}><i className="fas fa-exclamation-triangle"></i></div>
                        <h3 className={styles['modal-title']}>Delete Chat?</h3>
                        <p className={styles['modal-desc']}>This action cannot be undone. All messages in this conversation will be permanently removed.</p>
                        <div className={styles['modal-actions']}>
                            <button className={`${styles['modal-btn']} ${styles['cancel-btn']}`} onClick={() => setModalConfig({ show: false, sessionId: null })}>Cancel</button>
                            <button className={`${styles['modal-btn']} ${styles['confirm-btn']}`} onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`toast ${toastVisible ? 'show' : ''}`} style={{
                position: 'fixed', top: '20px', right: '20px', background: '#333', color: 'white',
                padding: '10px 20px', borderRadius: '5px', opacity: toastVisible ? 1 : 0,
                transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 9999
            }}>Copied to clipboard!</div>

            <style>{`@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
        </>
    );
}

export default AIInteract;