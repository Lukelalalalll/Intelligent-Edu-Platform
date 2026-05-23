import React from 'react';
import MessageItem from './MessageItem';
import styles from '../styles/AIMessage.module.css';
import type { RagCitation } from '../../../types/api';

interface MessageListProps {
    currentSession?: {
        id: string;
        messages: Array<{
            role: string;
            content: string;
            images?: string[];
            files?: { file_name: string; mime_type: string }[];
            citations?: RagCitation[];
        }>;
    };
    isTyping?: boolean;
    chatMessagesRef?: React.RefObject<HTMLDivElement>;
    handleChatAreaClick?: (e: React.MouseEvent) => void;
    copyToClipboard?: (text: string, el: HTMLElement | null) => void;
    handleRegenerate?: (msgId: number) => void;
    handleEditUserMsg?: (msgId: number, content: string) => void;
}

const MessageList = React.memo(function MessageList({
    currentSession, isTyping, chatMessagesRef, handleChatAreaClick,
    copyToClipboard, handleRegenerate, handleEditUserMsg
}: MessageListProps) {
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
                        idx={idx}
                        isUser={isUser}
                        onCopy={copyToClipboard!}
                        isLastAssistant={isLastAssistant}
                        onRegenerate={handleRegenerate!}
                        onEdit={handleEditUserMsg!}
                        isTyping={isTyping ?? false}
                    />
                );
            })}

            {isTyping && (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) && (
                <div className={`${styles.message} ${styles['ai-message']} ${styles['typing-indicator-msg']}`}>
                    <div className={styles.avatar}><i className="fas fa-robot"></i></div>
                    <div className={`${styles.bubble} ${styles['typing-bubble']}`} style={{ padding: '12px 20px' }}>
                        <div className={styles['typing-dots']}>
                            <span className={styles['typing-dot']}></span>
                            <span className={styles['typing-dot']}></span>
                            <span className={styles['typing-dot']}></span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MessageList;