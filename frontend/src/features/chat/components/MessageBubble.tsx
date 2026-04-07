// frontend/src/features/chat/components/MessageBubble.tsx

import React, { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types';
import styles from '../styles/Chat.module.css';
import { chatApi } from '../../../api/chatApi';
import { useChatStore } from '../store/chatStore';
import MessageContextMenu from './MessageContextMenu';

interface Props {
    message: ChatMessage;
    isOwn: boolean;
    showSender: boolean;
    multiSelect: boolean;
    selected: boolean;
    onToggleSelect: (id: string) => void;
    onQuote: (msg: ChatMessage) => void;
    onEnterMultiSelect: (id: string) => void;
}

function formatMsgTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(mimeType?: string): string {
    if (!mimeType) return 'fa-file';
    if (mimeType.startsWith('image/')) return 'fa-file-image';
    if (mimeType === 'application/pdf') return 'fa-file-pdf';
    if (mimeType.includes('word')) return 'fa-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'fa-file-archive';
    return 'fa-file';
}

export default function MessageBubble({ message, isOwn, showSender, multiSelect, selected, onToggleSelect, onQuote, onEnterMultiSelect }: Props) {
    const [hovering, setHovering] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const recallMsg = useChatStore((s) => s.recallMessage);

    const canRecall = (() => {
        if (!isOwn || message.recalled) return false;
        const diff = (Date.now() - new Date(message.sentAt).getTime()) / 1000;
        return diff < 120;
    })();

    const handleRecall = async () => {
        try {
            await chatApi.recallMessage(message.id);
            recallMsg(message.roomId, message.id);
        } catch {
            // silently ignore
        }
    };

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(message.content || '').catch(() => {});
    }, [message.content]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (multiSelect || message.recalled || message.type === 'system') return;
        // Position menu next to the bubble
        if (bubbleRef.current) {
            const rect = bubbleRef.current.getBoundingClientRect();
            const x = isOwn ? rect.left - 6 : rect.right + 6;
            const y = rect.top + rect.height / 2;
            setContextMenu({ x, y });
        } else {
            setContextMenu({ x: e.clientX, y: e.clientY });
        }
    }, [multiSelect, message.recalled, message.type, isOwn]);

    const handleBubbleClick = useCallback((e: React.MouseEvent) => {
        if (multiSelect) return; // handled by row click
        if (message.recalled || message.type === 'system') return;
        e.stopPropagation();
        // Position menu next to the bubble
        if (bubbleRef.current) {
            const rect = bubbleRef.current.getBoundingClientRect();
            const x = isOwn ? rect.left - 6 : rect.right + 6;
            const y = rect.top + rect.height / 2;
            setContextMenu({ x, y });
        }
    }, [multiSelect, message.recalled, message.type, isOwn]);

    const handleClick = useCallback(() => {
        if (multiSelect && !message.recalled && message.type !== 'system') {
            onToggleSelect(message.id);
        }
    }, [multiSelect, message.id, message.recalled, message.type, onToggleSelect]);

    const handleDownload = (e: React.MouseEvent) => {
        e.preventDefault();
        let url = message.fileUrl;
        if (!url) return;

        // Normalize: strip any absolute origin prefix so the Vite proxy can serve it
        // as same-origin (avoids CORS issues in dev and works in prod too).
        try {
            const parsed = new URL(url);
            url = parsed.pathname + parsed.search;  // Keep only /static/chat_files/...
        } catch {
            // url is already relative — leave as-is
        }

        // Synchronous anchor-click avoids losing the user-activation context
        // that async fetch/blob would break (Safari/Firefox block the download).
        const a = document.createElement('a');
        a.href = url;
        a.download = message.fileName || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    if (message.type === 'system') {
        return (
            <div className={styles.systemMessage}>
                <span className={styles.systemMessageText}>{message.content}</span>
            </div>
        );
    }

    if (message.recalled) {
        return (
            <div className={`${styles.messageRow} ${isOwn ? styles.messageRowOwn : styles.messageRowOther}`}>
                <div className={`${styles.messageBubble} ${styles.recalledBubble}`}>
                    <i className="fas fa-ban" style={{ marginRight: 6, opacity: 0.5 }} />
                    <span className={styles.recalledText}>
                        {isOwn ? 'You recalled this message' : `${message.senderName} recalled a message`}
                    </span>
                </div>
            </div>
        );
    }

    const isFile = message.messageType === 'file';

    return (
        <div
            className={`${styles.messageRow} ${isOwn ? styles.messageRowOwn : styles.messageRowOther} ${multiSelect ? styles.messageRowMultiSelect : ''} ${selected ? styles.messageRowSelected : ''}`}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onContextMenu={handleContextMenu}
            onClick={handleClick}
        >
            {multiSelect && (
                <div className={styles.multiSelectCheck}>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(message.id)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {!multiSelect && isOwn && canRecall && hovering && (
                <button className={styles.recallBtn} onClick={(e) => { e.stopPropagation(); handleRecall(); }} title="Recall message">
                    <i className="fas fa-undo-alt" />
                </button>
            )}
            <div
                ref={bubbleRef}
                className={`${styles.messageBubble} ${isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther}`}
                onClick={handleBubbleClick}
            >
                {!isOwn && showSender && (
                    <div className={styles.messageSender}>{message.senderName}</div>
                )}

                {message.forwardedFrom && (
                    <div className={styles.forwardedLabel}>
                        <i className="fas fa-share" style={{ marginRight: 4, fontSize: '0.7rem' }} />
                        Forwarded from {message.forwardedFrom}
                    </div>
                )}

                {message.replyTo && (
                    <div className={styles.replySnippet}>
                        <div className={styles.replySnippetName}>{message.replyTo.senderName}</div>
                        <div className={styles.replySnippetText}>{message.replyTo.content}</div>
                    </div>
                )}

                {isFile ? (
                    <div
                        className={styles.fileCard}
                        onClick={handleDownload}
                        role="button"
                        tabIndex={0}
                        aria-busy={false}
                    >
                        <i className={`fas ${getFileIcon(message.mimeType)} ${styles.fileCardIcon}`} />
                        <div className={styles.fileCardInfo}>
                            <span className={styles.fileCardName}>{message.fileName}</span>
                            <span className={styles.fileCardSize}>{formatFileSize(message.fileSize)}</span>
                        </div>
                        <i
                            className={`fas fa-download`}
                            style={{ marginLeft: 'auto', opacity: 0.6 }}
                        />
                    </div>
                ) : (
                    <div>{message.content}</div>
                )}
                <div className={styles.messageTime}>{formatMsgTime(message.sentAt)}</div>
            </div>

            {contextMenu && (
                <MessageContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    isOwn={isOwn}
                    canRecall={canRecall}
                    messageContent={message.content || ''}
                    messageId={message.id}
                    onClose={() => setContextMenu(null)}
                    onCopy={handleCopy}
                    onQuote={() => onQuote(message)}
                    onRecall={handleRecall}
                    onMultiSelect={() => onEnterMultiSelect(message.id)}
                />
            )}
        </div>
    );
}
