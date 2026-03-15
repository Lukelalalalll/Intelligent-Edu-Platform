import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
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
const MessageItem = memo(({ msg, isUser, onCopy }) => {
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
                <div className={styles.bubble} style={{ minHeight: '20px' }}>
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
                    {msg.content}
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
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.msg.content === nextProps.msg.content &&
           prevProps.msg.role === nextProps.msg.role &&
           JSON.stringify(prevProps.msg.files) === JSON.stringify(nextProps.msg.files);
});

// --- 主 UI 组件 ---
function AIInteract({
    sessions, currentSessionId, inputText, isTyping, modalConfig, toastVisible,
    chatMessagesRef, inputRef, createNewSession, deleteSession, confirmDelete,
    setModalConfig, handleInput, handleKeyDown, handleSend, copyToClipboard, handleChatAreaClick,
    // 新增的文件上传相关 Props
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile
}) {
    const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
    const lastMessage = currentSession?.messages[currentSession.messages.length - 1];

    return (
        <>
            <div className={styles['ai-workspace-wrapper']}>
                <div className={styles['workspace-glow']}></div>

                <div className={styles['ai-workspace-container']}>
                    {/* 左侧栏 */}
                    <aside className={styles['chat-sidebar']}>
                        <button className={styles['new-chat-btn']} onClick={() => createNewSession(true)}>
                            <i className="fas fa-plus"></i> New Chat
                        </button>
                        <div className={styles['sidebar-title']}>Recent Conversations</div>
                        <div className={styles['history-list']}>
                            {sessions.map(session => (
                                <div key={session.id} className={`${styles['history-item']} ${session.id === currentSessionId ? styles.active : ''}`}>
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
                                    <div className={styles.bubble}>Hello! I'm your HKU AI Assistant. I can help you with academic research, code explanation, or generating course materials. You can also upload Images, PDFs, or DOCX files. What would you like to explore today?</div>
                                </div>
                            )}

                            {currentSession?.messages.map((msg, idx) => {
                                if (msg.role === 'system') return null;
                                if (msg.role === 'assistant' && !msg.content) return null;
                                return (
                                    <MessageItem key={`${currentSession.id}-${idx}`} msg={msg} isUser={msg.role === 'user'} onCopy={copyToClipboard} />
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
                            {attachedFiles && attachedFiles.length > 0 && (
                                <div style={{ display: 'flex', gap: '10px', padding: '0 15px 10px', flexWrap: 'wrap' }}>
                                    {attachedFiles.map((file, idx) => (
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
                                               onClick={() => removeAttachedFile(idx)}
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
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    onChange={handleFileChange}
                                />

                                {/* 附件上传按钮 */}
                                <button
                                    type="button"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '20px',
                                        color: '#6b7280',
                                        cursor: isTyping || isUploadingFile ? 'not-allowed' : 'pointer',
                                        padding: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'color 0.2s'
                                    }}
                                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                    disabled={isTyping || isUploadingFile}
                                    title="Attach File (Image, PDF, DOCX)"
                                >
                                    {isUploadingFile ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paperclip"></i>}
                                </button>

                                <textarea
                                    className={styles['workspace-input']}
                                    ref={inputRef} rows="1"
                                    placeholder="Type your academic query or attach a file... (Press Enter to send)"
                                    value={inputText} onChange={handleInput} onKeyDown={handleKeyDown}
                                    data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                                    style={{ flex: 1 }}
                                ></textarea>

                                <button className={styles['send-btn']} onClick={handleSend} disabled={isTyping || isUploadingFile}>
                                    <i className="fas fa-paper-plane"></i>
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

// --- 父组件逻辑 ---
export default function AIInteractEntry() {
    const [sessions, setSessions] = useState(() => {
        const saved = localStorage.getItem('hku_ai_sessions');
        return saved ? JSON.parse(saved) : [];
    });
    const [currentSessionId, setCurrentSessionId] = useState(() => {
        return localStorage.getItem('hku_ai_current_id') || null;
    });
    const [inputText, setInputText] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [modalConfig, setModalConfig] = useState({ show: false, sessionId: null });
    const [toastVisible, setToastVisible] = useState(false);

    // 新增：文件上传相关 State
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const fileInputRef = useRef(null);

    const chatMessagesRef = useRef(null);
    const inputRef = useRef(null);

    // 自动滚动到底部
    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
    }, [sessions, attachedFiles]); // 添加 attachedFiles 依赖，保证预览区出现时也能滚到底部

    useEffect(() => {
        if (sessions.length === 0) createNewSession(true);
        else if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
            setCurrentSessionId(sessions[0].id);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('hku_ai_sessions', JSON.stringify(sessions));
        localStorage.setItem('hku_ai_current_id', currentSessionId);
    }, [sessions, currentSessionId]);

    const createNewSession = (switchImmediately = true, forceId = null) => {
        if (forceId) { setCurrentSessionId(forceId); return; }
        const newSession = {
            id: 'session_' + Date.now(),
            title: 'New Conversation',
            messages: [{ role: "system", content: "You are a helpful academic AI assistant for HKU." }]
        };
        setSessions(prev => [newSession, ...prev]);
        if (switchImmediately) setCurrentSessionId(newSession.id);
        setAttachedFiles([]); // 切换会话时清空草稿附件
        setInputText("");
    };

    const deleteSession = (e, id) => { e.stopPropagation(); setModalConfig({ show: true, sessionId: id }); };

    const confirmDelete = () => {
        const idToDelete = modalConfig.sessionId;
        const newSessions = sessions.filter(s => s.id !== idToDelete);
        if (newSessions.length === 0) createNewSession(true);
        else {
            setSessions(newSessions);
            if (currentSessionId === idToDelete) setCurrentSessionId(newSessions[0].id);
        }
        setModalConfig({ show: false, sessionId: null });
    };

    // --- 新增：处理文件选择与上传 ---
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 验证文件类型
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
        ];

        if (!allowedTypes.includes(file.type)) {
            alert("Format not supported. Only images, PDF, and DOCX files are allowed.");
            e.target.value = '';
            return;
        }

        setIsUploadingFile(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch('http://localhost:5009/api/ai/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await res.json();

            if (res.ok && data.file_id) {
                setAttachedFiles(prev => [...prev, data]);
            } else {
                alert("Upload failed: " + (data.error || "Unknown error"));
            }
        } catch (error) {
            alert("Network error during upload.");
        } finally {
            setIsUploadingFile(false);
            e.target.value = ''; // 重置 input 以允许重复上传同名文件
        }
    };

    const removeAttachedFile = (idxToRemove) => {
        setAttachedFiles(prev => prev.filter((_, idx) => idx !== idxToRemove));
    };

    // --- 修改：发送消息 (携带文件) ---
    const handleSend = async () => {
        if (isTyping || isUploadingFile) return;

        let targetId = currentSessionId;
        if (!targetId && sessions.length > 0) {
            targetId = sessions[0].id;
            setCurrentSessionId(targetId);
        }

        // 允许只发文件不发文字
        if (!inputText.trim() && attachedFiles.length === 0) return;

        const textToSend = inputText.trim();
        const filesToSend = [...attachedFiles]; // 锁定当前要发送的文件

        setInputText("");
        setAttachedFiles([]); // 清空输入框附带的文件
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setIsTyping(true);

        setSessions(prev => prev.map(s => {
            if (s.id === targetId) {
                let newTitle = s.title;
                if (s.messages.length <= 1) {
                    newTitle = textToSend.length > 20
                        ? textToSend.substring(0, 20) + '...'
                        : (textToSend || "File Upload");
                }
                // 加入包含 files 的 user 消息
                const newMessages = [
                    ...s.messages,
                    { role: "user", content: textToSend, files: filesToSend },
                    { role: "assistant", content: "" }
                ];
                return { ...s, title: newTitle, messages: newMessages };
            }
            return s;
        }));

        try {
            const currentSess = sessions.find(s => s.id === targetId);
            const messagesForAPI = currentSess
                ? [...currentSess.messages, { role: "user", content: textToSend, files: filesToSend }]
                : [];

            const response = await fetch('http://localhost:5009/api/ai/chat', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                // 仅过滤出最近的几条记录和有效身份
                body: JSON.stringify({
                    messages: messagesForAPI.filter(m => m.role !== 'system' || messagesForAPI.length < 5)
                })
            });

            if (!response.ok) {
                setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...s.messages.slice(0,-1), { role: "assistant", content: `API Error: ${response.status}` }] } : s));
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

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const dataStr = trimmed.replace('data: ', '');
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
                    } catch (e) { /* ignore parse error */ }
                }
            }
        } catch (error) {
            setSessions(prev => prev.map(s => s.id === targetId ? { ...s, messages: [...s.messages.slice(0,-1), { role: "assistant", content: `Network Error: ${error.message}` }] } : s));
        } finally {
            setIsTyping(false);
        }
    };

    const handleInput = (e) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const showToast = useCallback(() => { setToastVisible(true); setTimeout(() => setToastVisible(false), 2500); }, []);

    const copyToClipboard = useCallback((text, buttonEl = null) => {
        navigator.clipboard.writeText(text).then(showToast).catch(() => {
            const textArea = document.createElement("textarea");
            textArea.value = text; document.body.appendChild(textArea); textArea.select();
            document.execCommand("copy"); document.body.removeChild(textArea); showToast();
        });
        if (buttonEl) {
            const originalHtml = buttonEl.innerHTML;
            buttonEl.innerHTML = `<i class="fas fa-check" style="color:#27c93f;"></i> Copied!`;
            setTimeout(() => { if (buttonEl) buttonEl.innerHTML = originalHtml; }, 2000);
        }
    }, [showToast]);

    const handleChatAreaClick = useCallback((e) => {
        const copyBtn = e.target.closest('.js-code-copy-btn');
        if (copyBtn) copyToClipboard(decodeURIComponent(copyBtn.getAttribute('data-code')), copyBtn);
    }, [copyToClipboard]);

    // 将所有的状态和方法注入到纯 UI 组件
    const pageProps = {
        sessions, currentSessionId, inputText, isTyping, modalConfig, toastVisible,
        chatMessagesRef, inputRef, createNewSession, deleteSession, confirmDelete,
        setModalConfig, handleInput, handleKeyDown, handleSend, copyToClipboard, handleChatAreaClick,
        attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile
    };

    return <AIInteract {...pageProps} />;
}