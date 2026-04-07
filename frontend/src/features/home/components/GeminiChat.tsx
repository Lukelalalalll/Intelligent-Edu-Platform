import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { renderMarkdown } from '../utils/markdownRenderer';
import { useGeminiChat } from '../hooks/useGeminiChat';
import styles from '../styles/home.module.css';
import 'highlight.js/styles/github-dark.css';

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
    },
};

const messageVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
};

interface GeminiChatProps {
    aiInteractUrl?: string;
}

const GeminiChat = ({ aiInteractUrl }: GeminiChatProps) => {
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const {
        messages, input, isLoading, editingId, editingVal,
        inputAreaRef,
        setEditingId, setEditingVal,
        handleInput, handleSend, handleStop,
        handleRegenerate, handleEditUserMsg, handleKeyDown,
    } = useGeminiChat(messagesContainerRef);

    const lastMessage = messages.at(-1);

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
                >
                    <AnimatePresence>
                        {messages.map((msg, idx) => {
                            if (msg.sender === 'ai' && !msg.text) return null;
                            const senderClassKey = `${msg.sender}-message`;
                            const messageClass = `${styles.message} ${styles[senderClassKey]}`;
                            const isEditingUser = msg.sender === 'user' && editingId === msg.id;
                            return (
                                <motion.div
                                    key={msg.id}
                                    variants={messageVariants}
                                    initial="hidden"
                                    animate="show"
                                    className={messageClass}
                                >
                                    <div className={styles.avatar}>
                                        {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
                                    </div>
                                    <div className={styles.bubble}>
                                        {msg.sender === 'ai' && (
                                            <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(msg.text)} />
                                        )}
                                        {msg.sender === 'user' && isEditingUser && (
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
                                        )}
                                        {msg.sender === 'user' && !isEditingUser && (
                                            <>
                                                {msg.text}
                                                {!isLoading && (
                                                    <div className={styles['user-actions']}>
                                                        <button onClick={() => { setEditingId(msg.id); setEditingVal(msg.text); }}><i className="fas fa-edit"></i></button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {msg.sender === 'ai' && !isLoading && msg.id === messages.at(-1)?.id && (
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
                        {isLoading && (lastMessage?.sender !== 'ai' || !lastMessage?.text) && (
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
                            rows={1} placeholder="Ask anything..."
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
