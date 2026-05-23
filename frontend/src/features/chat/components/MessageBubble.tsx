// frontend/src/features/chat/components/MessageBubble.tsx

import React, { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import type { ChatMessage } from '../types';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/MultiSelect.module.css';
import { chatApi } from '../api';
import { useChatStore } from '../store/chatStore';
import MessageContextMenu from './MessageContextMenu';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...sidebarStyles,
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
    ...modalStyles,
};

interface Props {
    message: ChatMessage;
    isOwn: boolean;
    showSender: boolean;
    multiSelect: boolean;
    selected: boolean;
    onToggleSelect: (id: string) => void;
    onQuote: (msg: ChatMessage) => void;
    onEnterMultiSelect: (id: string) => void;
    onTransfer?: (msg: ChatMessage) => void;
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

function isImageFile(mimeType?: string, fileName?: string): boolean {
    if (mimeType && mimeType.startsWith('image/')) return true;
    if (fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '');
    }
    return false;
}

function inferExtFromMeta(mimeType?: string, fileUrl?: string): string {
    const fromUrl = (fileUrl || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || '';
    if (fromUrl && fromUrl.length <= 8 && !fromUrl.includes('/')) return fromUrl;
    const mime = (mimeType || '').toLowerCase();
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('markdown')) return 'md';
    if (mime.includes('png')) return 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('wordprocessingml')) return 'docx';
    if (mime.includes('msword')) return 'doc';
    return '';
}

function buildDownloadName(name?: string, mimeType?: string, fileUrl?: string): string {
    const raw = String(name || 'file').trim() || 'file';
    const hintedExt = inferExtFromMeta(mimeType, fileUrl);
    if (!hintedExt) return raw;
    if (raw.toLowerCase().endsWith(`.${hintedExt}`)) return raw;
    if (!raw.includes('.')) return `${raw}.${hintedExt}`;
    return `${raw}.${hintedExt}`;
}

export default function MessageBubble({ message, isOwn, showSender, multiSelect, selected, onToggleSelect, onQuote, onEnterMultiSelect, onTransfer }: Props) {
    const [hovering, setHovering] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
        preferredSide: 'left' | 'right';
    } | null>(null);
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
        // Position menu next to the bubble.
        if (bubbleRef.current) {
            const rect = bubbleRef.current.getBoundingClientRect();
            const x = isOwn ? rect.left : rect.right;
            const y = rect.top + rect.height / 2;
            setContextMenu({
                x,
                y,
                anchorRect: {
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                },
                preferredSide: isOwn ? 'left' : 'right',
            });
        } else {
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                anchorRect: {
                    top: e.clientY,
                    left: e.clientX,
                    right: e.clientX,
                    bottom: e.clientY,
                    width: 0,
                    height: 0,
                },
                preferredSide: isOwn ? 'left' : 'right',
            });
        }
    }, [multiSelect, message.recalled, message.type, isOwn]);

    const handleBubbleClick = useCallback((e: React.MouseEvent) => {
        if (multiSelect) return; // handled by row click
        if (message.recalled || message.type === 'system') return;
        e.stopPropagation();
        // Position menu next to the bubble.
        if (bubbleRef.current) {
            const rect = bubbleRef.current.getBoundingClientRect();
            const x = isOwn ? rect.left : rect.right;
            const y = rect.top + rect.height / 2;
            setContextMenu({
                x,
                y,
                anchorRect: {
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                },
                preferredSide: isOwn ? 'left' : 'right',
            });
        }
    }, [multiSelect, message.recalled, message.type, isOwn]);

    const handleClick = useCallback(() => {
        if (multiSelect && !message.recalled && message.type !== 'system') {
            onToggleSelect(message.id);
        }
    }, [multiSelect, message.id, message.recalled, message.type, onToggleSelect]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!fileUrl) return;
        const downloadName = buildDownloadName(message.fileName, message.mimeType, message.fileUrl);
        try {
            const blob = await chatApi.fetchFileBlob(fileUrl);
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        } catch {
            try {
                const a = document.createElement('a');
                a.href = fileUrl;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.download = downloadName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch {
                toast.error('Download failed. Please try again and verify your login session.');
            }
        }
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
    const isImage = isFile && isImageFile(message.mimeType, message.fileName);
    const isPersistedMessage = !String(message.id || '').startsWith('optimistic-');
    const canTransfer = Boolean(onTransfer && !multiSelect && isPersistedMessage && !message.failed);

    const fileUrl = chatApi.toAbsoluteFileUrl(message.fileUrl || '');

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
                    isImage ? (
                        /* ── Image thumbnail ── */
                        <div className={styles.imageMsgWrapper}>
                            <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <img
                                    src={fileUrl}
                                    alt={message.fileName || 'image'}
                                    className={styles.imageMsgThumb}
                                    onError={(e) => {
                                        // Fallback to file card on broken image
                                        (e.currentTarget.closest(`.${styles.imageMsgWrapper}`) as HTMLElement | null)
                                            ?.setAttribute('data-broken', 'true');
                                    }}
                                />
                            </a>
                            <div className={styles.imageMsgMeta}>
                                <span className={styles.imageMsgName}>{message.fileName}</span>
                                <button
                                    className={styles.imageMsgDownload}
                                    onClick={handleDownload}
                                    title="Download"
                                >
                                    <i className="fas fa-download" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ── Generic file card ── */
                        <div className={styles.fileCard}>
                            <div
                                className={styles.fileCardMain}
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
                            {canTransfer && (
                                <button
                                    className={styles.transferBtn}
                                    onClick={(e) => { e.stopPropagation(); onTransfer?.(message); }}
                                    title="Send to module"
                                >
                                    <i className="fas fa-exchange-alt" style={{ marginRight: 4 }} />
                                    Transfer
                                </button>
                            )}
                        </div>
                    )
                ) : (
                    <div>{message.content}</div>
                )}
                <div className={styles.messageTime}>{formatMsgTime(message.sentAt)}</div>
            </div>

            {contextMenu && (
                <MessageContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    anchorRect={contextMenu.anchorRect}
                    preferredSide={contextMenu.preferredSide}
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
