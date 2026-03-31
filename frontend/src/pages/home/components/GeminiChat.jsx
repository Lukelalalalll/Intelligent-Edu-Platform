import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePretextMeasure } from '../../../hooks/usePretextMeasure';
import styles from '../../../styles/home/home.module.css';
import 'highlight.js/styles/github-dark.css';

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 300, damping: 24 }
    }
};

const messageVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 400, damping: 25 } }
};

// --- Markdown 渲染配置，复用 AIInteract 的代码块格式 ---
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

const GeminiChat = ({ aiInteractUrl }) => {
    const [messages, setMessages] = useState([
        { id: 'welcome', sender: 'ai', role: 'assistant', text: "Hi there! I'm your HKU AI Assistant. How can I help you with your studies today?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editingVal, setEditingVal] = useState('');

    const messagesContainerRef = useRef(null);
    const inputAreaRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Pretext: reflow-free scroll management
    const { scrollToBottom } = usePretextMeasure(messagesContainerRef, {
        font: '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 25.6,
        debounceMs: 60,
    });

    // rAF-batched streaming ref (one flush per animation frame ≈16ms for typewriter feel)
    const streamRafRef = useRef(null);

    const renderContent = useCallback((content) => {
        if (!content) return { __html: '' };
        try {
            const rawHtml = typeof marked.parse === 'function' ? marked.parse(content) : marked(content);
            const cleanHtml = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ['class', 'data-code'],
                ADD_TAGS: ['button', 'i', 'span']
            });
            return { __html: cleanHtml };
        } catch (err) {
            return { __html: `<p style="color:red">Render Error: ${content}</p>` };
        }
    }, []);

    const copyToClipboard = useCallback((text, buttonEl = null) => {
        navigator.clipboard.writeText(text).catch(() => {
            const area = document.createElement('textarea');
            area.value = text; document.body.appendChild(area); area.select();
            document.execCommand('copy'); document.body.removeChild(area);
        });
        if (buttonEl) {
            const original = buttonEl.innerHTML;
            buttonEl.innerHTML = '<i class="fas fa-check" style="color:#27c93f;"></i> Copied!';
            setTimeout(() => { if (buttonEl) buttonEl.innerHTML = original; }, 1800);
        }
    }, []);

    const handleChatAreaClick = useCallback((e) => {
        const copyBtn = e.target.closest('.js-code-copy-btn');
        if (copyBtn) copyToClipboard(decodeURIComponent(copyBtn.getAttribute('data-code')), copyBtn);
    }, [copyToClipboard]);

    useEffect(() => {
        scrollToBottom(/* immediate */ !isLoading);
    }, [messages, isLoading, scrollToBottom]);

    const handleInput = useCallback((e) => {
        const target = e.target;
        setInput(target.value);
        target.style.height = 'auto';
        target.style.height = target.scrollHeight + 'px';
        if (target.value === '') target.style.height = 'auto';
    }, []);

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const userText = input.trim();
        setInput('');
        if (inputAreaRef.current) inputAreaRef.current.style.height = 'auto';

        const userMsg = { id: crypto.randomUUID(), sender: 'user', role: 'user', text: userText };
        const aiPlaceholderId = crypto.randomUUID();
        const aiMsg = { id: aiPlaceholderId, sender: 'ai', role: 'assistant', text: '' };

        setMessages(prev => [...prev, userMsg, aiMsg]);
        setIsLoading(true);

        try {
            const historyForAPI = messages
                .filter(m => m.id !== 'welcome')
                .concat(userMsg)
                .map(m => ({ role: m.role, content: m.text }));

            const apiRoot = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';
            const response = await fetch(`${apiRoot}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: historyForAPI }),
                credentials: 'include',
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let accumulatedText = "";
            let buffer = "";

            // rAF-batched flush: one state update per animation frame (~16ms) for typewriter feel
            const flushToState = () => {
                streamRafRef.current = null;
                const snapshot = accumulatedText;
                setMessages(prev => prev.map(m =>
                    m.id === aiPlaceholderId ? { ...m, text: snapshot } : m
                ));
            };
            const scheduleFlush = () => {
                if (streamRafRef.current != null) return;
                streamRafRef.current = requestAnimationFrame(flushToState);
            };

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
                        if (dataObj.error) accumulatedText += `\n\n**[Error]**: ${dataObj.error}`;
                        else if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                            accumulatedText += dataObj.choices[0].delta.content;
                        }
                        scheduleFlush();
                    } catch (e) {
                        // ignore partial JSON until buffer completes
                    }
                }
            }

            // Final flush
            if (streamRafRef.current != null) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
            flushToState();
        } catch (error) {
            if (error.name === 'AbortError') return;
            setMessages(prev => prev.map(m =>
                m.id === aiPlaceholderId ? { ...m, text: "Sorry, I encountered an error connecting to the AI server." } : m
            ));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [input, isLoading, messages]);

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        // Clean up any pending stream flush
        if (streamRafRef.current != null) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
        setIsLoading(false);
    }, []);

    const streamFromHistory = useCallback(async (history) => {
        if (!history.length) return;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const targetAssistantId = crypto.randomUUID();
        setMessages(historyWithAssistant => {
            return [...history, { id: targetAssistantId, sender: 'ai', role: 'assistant', text: '' }];
        });
        setIsLoading(true);

        try {
            const apiMessages = history.map(m => ({ role: m.role, content: m.text }));
            const apiRoot2 = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';
            const response = await fetch(`${apiRoot2}/api/ai/chat`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: apiMessages }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            let buffer = '';

            // rAF-batched flush for streamFromHistory — typewriter-smooth updates
            const flushToState = () => {
                streamRafRef.current = null;
                const snapshot = fullText;
                setMessages(prev => prev.map(m => m.id === targetAssistantId ? { ...m, text: snapshot } : m));
            };
            const scheduleFlush = () => {
                if (streamRafRef.current != null) return;
                streamRafRef.current = requestAnimationFrame(flushToState);
            };

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
                        const obj = JSON.parse(dataStr);
                        if (obj.choices?.[0]?.delta?.content !== undefined) {
                            fullText += obj.choices[0].delta.content;
                            scheduleFlush();
                        }
                    } catch (err) { /* ignore */ }
                }
            }

            // Final flush
            if (streamRafRef.current != null) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
            flushToState();
        } catch (error) {
            if (error.name === 'AbortError') return;
            setMessages(prev => prev.map(m => m.id === targetAssistantId ? { ...m, text: `Network Error: ${error.message}` } : m));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, []);

    const handleRegenerate = useCallback((idx) => {
        if (isLoading) return;
        const msg = messages[idx];
        if (!msg || msg.sender !== 'ai') return;
        const history = messages.slice(0, idx);
        streamFromHistory(history);
    }, [isLoading, messages, streamFromHistory]);

    const handleEditUserMsg = useCallback((idx, newVal) => {
        if (isLoading) return;
        const msg = messages[idx];
        if (!msg || msg.sender !== 'user') return;
        const trimmed = newVal.trim();
        if (!trimmed) return;
        const updatedUser = { ...msg, text: trimmed };
        const history = [...messages.slice(0, idx), updatedUser];
        streamFromHistory(history);
        setEditingId(null);
        setEditingVal('');
    }, [isLoading, messages, streamFromHistory]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const lastMessage = messages[messages.length - 1];

    return (
        <motion.section variants={itemVariants} className={styles['ai-interaction-section']}>
            <div className={styles['chat-interface-container']}>
                <div className={styles['chat-header']}>
                    <div className={styles['ai-badge']}>
                        <i className="fas fa-sparkles"></i>
                        <Link to={aiInteractUrl} className={styles['powered-by-link']}><span>AI Workspace</span></Link>
                    </div>
                </div>

                <div
                    ref={messagesContainerRef}
                    className={`${styles['chat-messages']} ${(messages.length > 0 || isLoading) ? styles['has-interaction'] : ''}`}
                    onClick={handleChatAreaClick}
                >
                    <AnimatePresence>
                        {messages.map((msg, idx) => {
                            if (msg.sender === 'ai' && !msg.text) return null;
                            return (
                                <motion.div
                                    key={msg.id}
                                    variants={messageVariants}
                                    initial="hidden"
                                    animate="show"
                                    className={`${styles.message} ${styles[`${msg.sender}-message`]}`}
                                >
                                    <div className={styles.avatar}>
                                        {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
                                    </div>
                                    <div className={styles.bubble}>
                                        {msg.sender === 'ai' ? (
                                            <div className="markdown-body" dangerouslySetInnerHTML={renderContent(msg.text)} />
                                        ) : (
                                            editingId === msg.id ? (
                                                <div className={styles['edit-box']}>
                                                    <textarea
                                                        value={editingVal}
                                                        onChange={e => setEditingVal(e.target.value)}
                                                        autoFocus
                                                        rows={Math.max(2, editingVal.split('\n').length)}
                                                    />
                                                    <div className={styles['edit-actions']}>
                                                        <button onClick={() => { setEditingId(null); setEditingVal(''); }}>Cancel</button>
                                                        <button onClick={() => handleEditUserMsg(idx, editingVal)} disabled={!editingVal.trim()}>Save &amp; Resend</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {msg.text}
                                                    {!isLoading && (
                                                        <div className={styles['user-actions']}>
                                                            <button onClick={() => { setEditingId(msg.id); setEditingVal(msg.text); }}><i className="fas fa-edit"></i></button>
                                                        </div>
                                                    )}
                                                </>
                                            )
                                        )}
                                        {msg.sender === 'ai' && !isLoading && msg.id === messages[messages.length - 1]?.id && (
                                            <div className={styles['message-actions']}>
                                                <button onClick={() => handleRegenerate(idx)} className={styles['msg-action-btn']}>
                                                    <i className="fas fa-sync-alt"></i> Regenerate
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                        {isLoading && (!lastMessage || lastMessage.sender !== 'ai' || !lastMessage.text) && (
                            <motion.div
                                variants={messageVariants}
                                initial="hidden"
                                animate="show"
                                exit={{ opacity: 0, y: -10 }}
                                className={`${styles.message} ${styles['ai-message']}`}
                            >
                                <div className={styles.avatar}><i className="fas fa-sparkles"></i></div>
                                <div className={`${styles.bubble} ${styles['typing-bubble']}`}>
                                    <div className={styles['typing-indicator']}><span></span><span></span><span></span></div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className={styles['input-area']}>
                    <div className={styles['input-wrapper']}>
                        <textarea
                            id="geminiInput"
                            className={styles.geminiInput}
                            ref={inputAreaRef}
                            rows="1" placeholder="Ask anything..."
                            value={input} onChange={handleInput}
                            onKeyDown={handleKeyDown}
                        ></textarea>
                        <button className={styles['stop-btn']} onClick={handleStop} disabled={!isLoading} title="Stop">
                            <i className="fas fa-stop"></i>
                        </button>
                        <button className={styles['send-btn']} disabled={!input.trim() || isLoading} onClick={handleSend}>
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </motion.section>
    );
};

export default GeminiChat;