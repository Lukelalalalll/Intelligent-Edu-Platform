import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { renderMarkdown } from '../../../utils/markdownRenderer';
import styles from '../../../styles/home.module.css';
import type { ChatMsg } from '../../../hooks/AIChatBox/types';

const messageVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
};

export default function MessageList({
    messages,
    isLoading,
    editingId,
    editingVal,
    setEditingId,
    setEditingVal,
    handleEditUserMsg,
    handleRegenerate,
}: {
    messages: ChatMsg[];
    isLoading: boolean;
    editingId: string | null;
    editingVal: string;
    setEditingId: (value: string | null) => void;
    setEditingVal: (value: string) => void;
    handleEditUserMsg: (idx: number, newVal: string) => void;
    handleRegenerate: (idx: number) => void;
}) {
    const lastMessage = messages.at(-1);

    return (
        <AnimatePresence>
            {messages.map((msg, idx) => {
                if (msg.sender === 'ai' && !msg.text) return null;
                const senderClassKey = `${msg.sender}-message`;
                const messageClass = `${styles.message} ${styles[senderClassKey]}`;
                const isEditingUser = msg.sender === 'user' && editingId === msg.id;

                return (
                    <motion.div key={msg.id} variants={messageVariants} initial="hidden" animate="show" className={messageClass}>
                        <div className={styles.avatar}>
                            {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
                        </div>
                        <div className={styles.bubble}>
                            {msg.sender === 'ai' && <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(msg.text)} />}

                            {msg.sender === 'user' && isEditingUser && (
                                <div className={styles['edit-box']}>
                                    <textarea
                                        value={editingVal}
                                        onChange={(e) => setEditingVal(e.target.value)}
                                        autoFocus
                                        rows={Math.max(2, editingVal.split('\n').length)}
                                    />
                                    <div className={styles['edit-actions']}>
                                        <button onClick={() => { setEditingId(null); setEditingVal(''); }}>Cancel</button>
                                        <button onClick={() => handleEditUserMsg(idx, editingVal)} disabled={!editingVal.trim()}>
                                            Save &amp; Resend
                                        </button>
                                    </div>
                                </div>
                            )}

                            {msg.sender === 'user' && !isEditingUser && (
                                <>
                                    {msg.text}
                                    {!isLoading && (
                                        <div className={styles['user-actions']}>
                                            <button onClick={() => { setEditingId(msg.id); setEditingVal(msg.text); }}>
                                                <i className="fas fa-edit"></i>
                                            </button>
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
    );
}
