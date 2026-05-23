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
    handleSendChoice,
}: {
    messages: ChatMsg[];
    isLoading: boolean;
    editingId: string | null;
    editingVal: string;
    setEditingId: (value: string | null) => void;
    setEditingVal: (value: string) => void;
    handleEditUserMsg: (idx: number, newVal: string) => void;
    handleRegenerate: (idx: number) => void;
    handleSendChoice?: (choice: string) => void;
}) {
    const lastMessage = messages.at(-1);

    return (
        <AnimatePresence>
            {messages.map((msg, idx) => {
                if (msg.sender === 'ai' && !msg.text && (!msg.uiElements || msg.uiElements.length === 0)) return null;
                const senderClassKey = `${msg.sender}-message`;
                const messageClass = `${styles.message} ${styles[senderClassKey]}`;
                const isEditingUser = msg.sender === 'user' && editingId === msg.id;

                return (
                    <motion.div key={msg.id} variants={messageVariants} initial="hidden" animate="show" className={messageClass} layout>
                        <div className={styles.avatar}>
                            {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
                        </div>
                        <div className={styles.bubble}>
                            {msg.sender === 'ai' && msg.modelProvider && (
                                <div className={`${styles['brand-badge']} ${styles[msg.modelProvider]}`}>
                                    {msg.modelProvider === 'coze' ? <><i className="fas fa-cloud"></i> Coze Model</> : <><i className="fas fa-microchip"></i> LLaMA Model</>}
                                </div>
                            )}
                            {msg.sender === 'ai' && msg.text && <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(msg.text)} />}

                            {msg.sender === 'ai' && msg.uiElements && msg.uiElements.length > 0 && (
                                <div className={styles['ui-elements-container']} style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {msg.uiElements.map((elem, i) => (
                                        <div key={i} className={styles['ui-element']}>
                                            {elem.type === 'image' && (
                                                <img src={elem.url} alt={elem.alt || 'extracted image'} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                                            )}
                                            {elem.type === 'file' && (
                                                <a href={elem.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 15px', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                                                    <i className="fas fa-file-download" style={{ marginRight: '8px' }}></i> Download Result
                                                </a>
                                            )}
                                            {elem.type === 'choice' && (
                                                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                    <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#334155' }}>{elem.message}</p>
                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                        {elem.options?.map((opt: string, j: number) => (
                                                            <button 
                                                                key={j} 
                                                                onClick={() => handleSendChoice && handleSendChoice(opt)}
                                                                disabled={isLoading}
                                                                style={{ padding: '6px 12px', background: isLoading ? '#f1f5f9' : '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                                                            >
                                                                {opt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

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
