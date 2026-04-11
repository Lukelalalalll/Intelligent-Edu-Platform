import React from 'react';
import MessageItem from './MessageItem';
import styles from '../styles/AIMessage.module.css';

export default function MessageList({
    currentSession, isTyping, chatMessagesRef, handleChatAreaClick,
    copyToClipboard, handleRegenerate, handleEditUserMsg
}) {
    const lastMessage = currentSession?.messages[currentSession.messages.length - 1];

    return (
        <div className={`${styles['chat-messages']} ${styles['full-workspace']}`} ref={chatMessagesRef} onClick={handleChatAreaClick}>
            {currentSession?.messages.length === 1 && (
                <div className={`${styles.message} ${styles['ai-message']}`}>
                    <div className={styles.avatar}><i className="fas fa-robot"></i></div>
                    <div className={styles.bubble}>
                        Hello! I'm your HKU AI Assistant. I can help you with academic research, code explanation, or generating course materials. You can also upload Images, PDFs, or DOCX files. What would you like to explore today?
                    </div>
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
    );
}