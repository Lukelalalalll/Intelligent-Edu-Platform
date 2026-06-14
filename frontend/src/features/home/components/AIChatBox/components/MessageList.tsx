import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/shared/i18n';
import { RenderedMarkdown } from '@/shared/markdown';
import styles from '../../../styles/HomeAIChat.module.css';
import type { ChatMsg } from '../../../hooks/AIChatBox/types';

const messageVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
};

interface HomeMessageItemProps {
    msg: ChatMsg;
    idx: number;
    messageCount: number;
    isLoading: boolean;
    editingId: string | null;
    editingVal: string;
    setEditingId: (value: string | null) => void;
    setEditingVal: (value: string) => void;
    handleEditUserMsg: (idx: number, newVal: string) => void;
    handleRegenerate: (idx: number) => void;
    handleSendChoice?: (choice: string) => void;
    t: (key: any) => string;
}

const HomeMessageItem = React.memo(function HomeMessageItem({
    msg,
    idx,
    messageCount,
    isLoading,
    editingId,
    editingVal,
    setEditingId,
    setEditingVal,
    handleEditUserMsg,
    handleRegenerate,
    handleSendChoice,
    t,
}: HomeMessageItemProps) {
    const senderClassKey = `${msg.sender}-message`;
    const messageClass = `${styles.message} ${styles[senderClassKey]}`;
    const isEditingUser = msg.sender === 'user' && editingId === msg.id;
    const isLastMessage = idx === messageCount - 1;

    return (
        <motion.div variants={messageVariants} initial="hidden" animate="show" className={messageClass}>
            <div className={styles.avatar}>
                {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
            </div>
            <div className={styles.bubble}>
                {msg.sender === 'ai' && msg.modelProvider && (
                    <div className={`${styles['brand-badge']} ${styles[msg.modelProvider]}`}>
                        {msg.modelProvider === 'coze' ? (
                            <><i className="fas fa-cloud"></i> {t('aiChat.cozeModel')}</>
                        ) : msg.modelProvider === 'deepseek' ? (
                            <><i className="fas fa-brain"></i> {t('aiChat.deepseekModel')}</>
                        ) : (
                            <><i className="fas fa-microchip"></i> {t('aiChat.llamaModel')}</>
                        )}
                    </div>
                )}
                {msg.sender === 'ai' && msg.text && (
                    <RenderedMarkdown
                        content={msg.text}
                        isStreaming={isLoading && isLastMessage}
                        deferHighlightDuringStreaming
                        className="markdown-body"
                    />
                )}

                {msg.sender === 'ai' && msg.uiElements && msg.uiElements.length > 0 && (
                    <div className={styles['ui-elements-container']} style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {msg.uiElements.map((elem, i) => (
                            <div key={i} className={styles['ui-element']}>
                                {elem.type === 'image' && (
                                    <img src={elem.url} alt={elem.alt || 'extracted image'} loading="lazy" decoding="async" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                                )}
                                {elem.type === 'file' && (
                                    <a href={elem.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 15px', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                                        <i className="fas fa-file-download" style={{ marginRight: '8px' }}></i> {t('aiChat.downloadResult')}
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
                            <button onClick={() => { setEditingId(null); setEditingVal(''); }}>{t('aiChat.cancel')}</button>
                            <button onClick={() => handleEditUserMsg(idx, editingVal)} disabled={!editingVal.trim()}>
                                {t('aiChat.saveResend')}
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

                {msg.sender === 'ai' && !isLoading && isLastMessage && (
                    <div className={styles['message-actions']}>
                        <button onClick={() => handleRegenerate(idx)} className={styles['msg-action-btn']}>
                            <i className="fas fa-sync-alt"></i> {t('aiChat.regenerate')}
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}, (prevProps, nextProps) => {
    if (prevProps.msg !== nextProps.msg) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.messageCount !== nextProps.messageCount) return false;
    if (prevProps.editingId !== nextProps.editingId) return false;
    if (prevProps.editingVal !== nextProps.editingVal) return false;
    return true;
});

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
    const { t } = useI18n();
    const lastMessage = messages.at(-1);

    return (
        <AnimatePresence>
            {messages.map((msg, idx) => {
                if (msg.sender === 'ai' && !msg.text && (!msg.uiElements || msg.uiElements.length === 0)) return null;

                return (
                    <HomeMessageItem
                        key={msg.id}
                        msg={msg}
                        idx={idx}
                        messageCount={messages.length}
                        isLoading={isLoading}
                        editingId={editingId}
                        editingVal={editingVal}
                        setEditingId={setEditingId}
                        setEditingVal={setEditingVal}
                        handleEditUserMsg={handleEditUserMsg}
                        handleRegenerate={handleRegenerate}
                        handleSendChoice={handleSendChoice}
                        t={t}
                    />
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
