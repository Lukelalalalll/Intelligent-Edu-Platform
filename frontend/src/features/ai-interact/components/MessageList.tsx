import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
    const messages = currentSession?.messages ?? [];
    const lastMessage = messages[messages.length - 1];
    const shouldVirtualize = messages.length > 40;

    const rowVirtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => chatMessagesRef?.current ?? null,
        estimateSize: () => 164,
        overscan: 6,
        getItemKey: (index) => `${currentSession?.id ?? 'session'}-${index}`,
    });

    const renderMessageItem = (msg: NonNullable<typeof currentSession>['messages'][number], idx: number) => {
        if (msg.role === 'system') return null;
        if (msg.role === 'assistant' && !msg.content) return null;
        const isUser = msg.role === 'user';
        const isLastAssistant = idx === messages.length - 1 && msg.role === 'assistant';

        return (
            <MessageItem
                key={`${currentSession?.id ?? 'session'}-${idx}`}
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
    };

    return (
        <div className={`${styles['chat-messages']} ${styles['full-workspace']}`} ref={chatMessagesRef} onClick={handleChatAreaClick}>
            {messages.length === 1 && (
                <div className={`${styles.message} ${styles['ai-message']}`}>
                    <div className={styles.avatar}><i className="fas fa-robot"></i></div>
                    <div className={styles.bubble}>
                        Hello! I'm your HKU AI Assistant. I can help you with academic research, code explanation, or generating course materials. You can also upload Images, PDFs, or DOCX files. What would you like to explore today?
                    </div>
                </div>
            )}

            {shouldVirtualize ? (
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const msg = messages[virtualItem.index];
                        if (!msg) return null;

                        return (
                            <div
                                key={virtualItem.key}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualItem.index}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                {renderMessageItem(msg, virtualItem.index)}
                            </div>
                        );
                    })}
                </div>
            ) : (
                messages.map((msg, idx) => renderMessageItem(msg, idx))
            )}

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
