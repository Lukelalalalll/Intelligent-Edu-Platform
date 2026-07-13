import React, { memo, useCallback } from 'react';
import styles from '../styles/AIMessage.module.css';
import type { RagCitation } from '../../../types/api';
import AIMessageBubble from './message/AIMessageBubble';
import UserMessageContent from './message/UserMessageContent';

interface MessageItemProps {
    msg: {
        role: string;
        content: string;
        reasoning?: string;
        images?: string[];
        files?: { file_name: string; mime_type: string }[];
        citations?: RagCitation[];
    };
    idx: number;
    isUser: boolean;
    onCopy: (text: string, el: HTMLElement | null) => void;
    isLastAssistant: boolean;
    onRegenerate: (idx: number) => void;
    onEdit: (idx: number, newVal: string) => void;
    isTyping: boolean;
}

const MessageItem = memo(function MessageItem({
    msg,
    idx,
    isUser,
    onCopy,
    isLastAssistant,
    onRegenerate,
    onEdit,
    isTyping,
}: MessageItemProps) {
    const handleRegen = useCallback(() => onRegenerate(idx), [idx, onRegenerate]);
    const handleEdit = useCallback((value: string) => onEdit(idx, value), [idx, onEdit]);

    return (
        <div className={`${styles.message} ${isUser ? styles['user-message'] : styles['ai-message']}`}>
            <div className={styles.avatar}>
                <i className={`fas ${isUser ? 'fa-user' : 'fa-robot'}`}></i>
            </div>

            {isUser ? (
                <UserMessageContent
                    content={msg.content}
                    images={msg.images}
                    files={msg.files}
                    isTyping={isTyping}
                    onEdit={handleEdit}
                />
            ) : (
                <AIMessageBubble
                    content={msg.content}
                    reasoning={(msg as typeof msg & { reasoning?: string }).reasoning}
                    citations={msg.citations}
                    isCourseRelevant={(msg as typeof msg & { is_course_relevant?: boolean }).is_course_relevant}
                    isTyping={isTyping}
                    isLastAssistant={isLastAssistant}
                    onCopy={onCopy}
                    onRegenerate={handleRegen}
                />
            )}
        </div>
    );
}, (prevProps: MessageItemProps, nextProps: MessageItemProps) => {
    if (prevProps.msg.content !== nextProps.msg.content) return false;
    if (prevProps.msg.role !== nextProps.msg.role) return false;
    if ((prevProps.msg as any).reasoning !== (nextProps.msg as any).reasoning) return false;
    if (prevProps.isTyping !== nextProps.isTyping) return false;
    if (prevProps.isLastAssistant !== nextProps.isLastAssistant) return false;
    if (prevProps.msg.images !== nextProps.msg.images) return false;
    if (prevProps.msg.files !== nextProps.msg.files) return false;
    if (prevProps.msg.citations !== nextProps.msg.citations) return false;
    return true;
});

export default MessageItem;
