import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import client from '../../../api/client';
import styles from '../../../styles/StudyRoom.module.css';

export default function StudyCoach({ pendingHighlight, onDismissHighlight, onSaveNote, pdfText }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [savedMsgIds, setSavedMsgIds] = useState(new Set());
    const messagesRef = useRef(null);
    const rafIdRef = useRef(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        const el = messagesRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    // Cleanup rAF on unmount
    useEffect(() => {
        return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
    }, []);

    // Helpers to update a single message by id (extracted to avoid deep nesting)
    const updateMessage = useCallback((msgId, content) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
    }, []);

    // rAF typewriter — reveals full text frame-by-frame, cancels previous animation
    const revealTypewriter = useCallback((fullText, msgId) => {
        // Cancel any previous typewriter to avoid orphaned rAF chains
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        let i = 0;
        const CHARS_PER_FRAME = 4;
        const tick = () => {
            i = Math.min(i + CHARS_PER_FRAME, fullText.length);
            updateMessage(msgId, fullText.slice(0, i));
            if (i < fullText.length) {
                rafIdRef.current = requestAnimationFrame(tick);
            } else {
                rafIdRef.current = null;
                setStreaming(false);
            }
        };
        rafIdRef.current = requestAnimationFrame(tick);
    }, [updateMessage]);

    // Coze polling study ask
    const askStudyCoze = useCallback(async (content, mode, history) => {
        setStreaming(true);
        const msgId = 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const assistantMsg = { role: 'assistant', content: '', id: msgId };
        setMessages(prev => [...prev, assistantMsg]);

        try {
            // Always send truncated PDF context so the AI retains document awareness
            const payload = {
                content,
                mode,
                messages: history,
            };
            if (pdfText) {
                payload.context = pdfText.slice(0, 8000);
            }

            const res = await client.post('/ai/study-coze', payload);
            const text = res.data?.reply || res.data?.text || 'No response from AI.';
            revealTypewriter(text, msgId);
        } catch (err) {
            updateMessage(msgId, 'Error: ' + (err?.response?.data?.detail || err.message));
            setStreaming(false);
        }
    }, [pdfText, revealTypewriter]);

    const handleAction = useCallback((mode) => {
        const hlText = typeof pendingHighlight === 'object' ? pendingHighlight?.text : pendingHighlight;
        if (!hlText || streaming) return;
        const userMsg = {
            role: 'user',
            content: `[${mode === 'hint' ? 'Hint' : 'Explain'}] ${hlText}`,
            id: 'msg-' + Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);
        onDismissHighlight();

        // Use current messages as history (userMsg not yet in state, pass it separately)
        const history = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg.content }];
        askStudyCoze(hlText, mode, history);
    }, [pendingHighlight, streaming, messages, onDismissHighlight, askStudyCoze]);

    // Auto-trigger when popover sends mode directly (pendingHighlight is { text, mode })
    const prevHighlightRef = useRef(null);
    useEffect(() => {
        if (!pendingHighlight || typeof pendingHighlight !== 'object') return;
        if (!pendingHighlight.text || !pendingHighlight.mode) return;
        // Prevent re-triggering for the same highlight
        const key = pendingHighlight.text + pendingHighlight.mode;
        if (prevHighlightRef.current === key) return;
        prevHighlightRef.current = key;
        handleAction(pendingHighlight.mode);
    }, [pendingHighlight, handleAction]);

    const handleSend = useCallback(() => {
        const trimmed = input.trim();
        if (!trimmed || streaming) return;
        const userMsg = { role: 'user', content: trimmed, id: 'msg-' + Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');

        // Build history including this new message (not yet in state)
        const history = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: trimmed }];
        askStudyCoze(trimmed, 'chat', history);
    }, [input, streaming, messages, askStudyCoze]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSaveAsNote = (msg) => {
        if (!onSaveNote || savedMsgIds.has(msg.id)) return;
        onSaveNote(msg.content);
        setSavedMsgIds(prev => new Set(prev).add(msg.id));
    };

    return (
        <div className={styles.coachCard}>
            {/* Header */}
            <div className={styles.coachHeader}>
                <div className={styles.coachAvatar}>
                    <i className="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <div className={styles.coachTitle}>AI Study Coach</div>
                    <div className={styles.coachSubtitle}>Highlight text to get explanations & hints</div>
                </div>
            </div>

            {/* Messages */}
            <div className={styles.coachMessages} ref={messagesRef}>
                {messages.length === 0 && !pendingHighlight ? (
                    <div className={styles.emptyCoach}>
                        <i className="fas fa-book-reader"></i>
                        <p>Upload a document and highlight any text to get started. I'll help you understand concepts and give hints for problems.</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id}>
                            <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.msgUser : styles.msgAssistant}`}>
                                {msg.role === 'assistant'
                                    ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    : msg.content}
                                {streaming && msg === messages.at(-1) && msg.role === 'assistant' && (
                                    <span className={styles.streamingDot}></span>
                                )}
                            </div>
                            {msg.role === 'assistant' && msg.content && !streaming && (
                                savedMsgIds.has(msg.id) ? (
                                    <div className={styles.savedTag}><i className="fas fa-check"></i> Saved to notes</div>
                                ) : (
                                    <button className={styles.saveNoteBtn} onClick={() => handleSaveAsNote(msg)}>
                                        <i className="fas fa-sticky-note"></i> Save as Note
                                    </button>
                                )
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Input Bar */}
            <div className={styles.coachInputBar}>
                <input
                    className={styles.coachInput}
                    placeholder="Ask a question about the material..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={streaming}
                />
                <button
                    className={styles.coachSendBtn}
                    onClick={handleSend}
                    disabled={streaming || !input.trim()}
                >
                    <i className="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    );
}

StudyCoach.propTypes = {
    pendingHighlight: PropTypes.oneOfType([PropTypes.string, PropTypes.shape({
        text: PropTypes.string,
        mode: PropTypes.string,
    })]),
    onDismissHighlight: PropTypes.func,
    onSaveNote: PropTypes.func,
    pdfText: PropTypes.string,
};
