// frontend/src/features/chat/components/MessageBubble.tsx

import React, { memo, useCallback, useRef, useState } from 'react';
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

type AnchorRect = {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

type ContextMenuState = {
    x: number;
    y: number;
    anchorRect: AnchorRect;
    preferredSide: 'left' | 'right';
};

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

function buildContextMenuState(
    bubbleEl: HTMLDivElement | null,
    isOwn: boolean,
    fallbackPoint?: { x: number; y: number },
): ContextMenuState | null {
    const preferredSide = isOwn ? 'left' : 'right';

    if (bubbleEl) {
        const rect = bubbleEl.getBoundingClientRect();
        return {
            x: isOwn ? rect.left : rect.right,
            y: rect.top + rect.height / 2,
            anchorRect: {
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
            },
            preferredSide,
        };
    }

    if (!fallbackPoint) return null;

    return {
        x: fallbackPoint.x,
        y: fallbackPoint.y,
        anchorRect: {
            top: fallbackPoint.y,
            left: fallbackPoint.x,
            right: fallbackPoint.x,
            bottom: fallbackPoint.y,
            width: 0,
            height: 0,
        },
        preferredSide,
    };
}

function renderSystemMessage(content: string) {
    return (
        <div className={styles.systemMessage}>
            <span className={styles.systemMessageText}>{content}</span>
        </div>
    );
}

function renderRecalledMessage(isOwn: boolean, senderName: string) {
    return (
        <div className={`${styles.messageRow} ${isOwn ? styles.messageRowOwn : styles.messageRowOther}`}>
            <div className={`${styles.messageBubble} ${styles.recalledBubble}`}>
                <i className="fas fa-ban" style={{ marginRight: 6, opacity: 0.5 }} />
                <span className={styles.recalledText}>
                    {isOwn ? 'You recalled this message' : `${senderName} recalled a message`}
                </span>
            </div>
        </div>
    );
}

function MessageBubbleHeader({
    isOwn,
    showSender,
    senderName,
    forwardedFrom,
    replyTo,
}: {
    isOwn: boolean;
    showSender: boolean;
    senderName: string;
    forwardedFrom?: string | null;
    replyTo?: ChatMessage['replyTo'];
}) {
    return (
        <>
            {!isOwn && showSender && (
                <div className={styles.messageSender}>{senderName}</div>
            )}

            {forwardedFrom && (
                <div className={styles.forwardedLabel}>
                    <i className="fas fa-share" style={{ marginRight: 4, fontSize: '0.7rem' }} />
                    Forwarded from {forwardedFrom}
                </div>
            )}

            {replyTo && (
                <div className={styles.replySnippet}>
                    <div className={styles.replySnippetName}>{replyTo.senderName}</div>
                    <div className={styles.replySnippetText}>{replyTo.content}</div>
                </div>
            )}
        </>
    );
}

function MessageBubbleAttachment({
    message,
    fileUrl,
    isImage,
    canTransfer,
    onDownload,
    onTransfer,
}: {
    message: ChatMessage;
    fileUrl: string;
    isImage: boolean;
    canTransfer: boolean;
    onDownload: React.MouseEventHandler<HTMLElement>;
    onTransfer?: (msg: ChatMessage) => void;
}) {
    if (isImage) {
        return (
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
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                            // Preserve the current broken-image marker without changing the UI contract.
                            (e.currentTarget.closest(`.${styles.imageMsgWrapper}`) as HTMLElement | null)
                                ?.setAttribute('data-broken', 'true');
                        }}
                    />
                </a>
                <div className={styles.imageMsgMeta}>
                    <span className={styles.imageMsgName}>{message.fileName}</span>
                    <button
                        className={styles.imageMsgDownload}
                        onClick={onDownload}
                        title="Download"
                    >
                        <i className="fas fa-download" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.fileCard}>
            <div
                className={styles.fileCardMain}
                onClick={onDownload}
                role="button"
                tabIndex={0}
                aria-busy={false}
            >
                <i className={`fas ${getFileIcon(message.mimeType)} ${styles.fileCardIcon}`} />
                <div className={styles.fileCardInfo}>
                    <span className={styles.fileCardName}>{message.fileName}</span>
                    <span className={styles.fileCardSize}>{formatFileSize(message.fileSize)}</span>
                </div>
                <i className="fas fa-download" style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </div>
            {canTransfer && (
                <button
                    className={styles.transferBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onTransfer?.(message);
                    }}
                    title="Send to module"
                >
                    <i className="fas fa-exchange-alt" style={{ marginRight: 4 }} />
                    Transfer
                </button>
            )}
        </div>
    );
}

function MessageBubbleBody({
    message,
    isFile,
    isImage,
    fileUrl,
    canTransfer,
    onDownload,
    onTransfer,
}: {
    message: ChatMessage;
    isFile: boolean;
    isImage: boolean;
    fileUrl: string;
    canTransfer: boolean;
    onDownload: React.MouseEventHandler<HTMLElement>;
    onTransfer?: (msg: ChatMessage) => void;
}) {
    if (!isFile) {
        return <div>{message.content}</div>;
    }

    return (
        <MessageBubbleAttachment
            message={message}
            fileUrl={fileUrl}
            isImage={isImage}
            canTransfer={canTransfer}
            onDownload={onDownload}
            onTransfer={onTransfer}
        />
    );
}

function MessageBubbleStatus({ sentAt }: { sentAt: string }) {
    return <div className={styles.messageTime}>{formatMsgTime(sentAt)}</div>;
}

function MessageBubbleActions({
    children,
    multiSelect,
    selected,
    messageId,
    onToggleSelect,
    showRecallButton,
    onRecall,
    contextMenu,
    contextMenuProps,
}: {
    children: React.ReactNode;
    multiSelect: boolean;
    selected: boolean;
    messageId: string;
    onToggleSelect: (id: string) => void;
    showRecallButton: boolean;
    onRecall: () => void | Promise<void>;
    contextMenu: ContextMenuState | null;
    contextMenuProps: {
        isOwn: boolean;
        canRecall: boolean;
        messageContent: string;
        messageId: string;
        onClose: () => void;
        onCopy: () => void;
        onQuote: () => void;
        onRecall: () => void | Promise<void>;
        onMultiSelect: () => void;
    };
}) {
    return (
        <>
            {multiSelect && (
                <div className={styles.multiSelectCheck}>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(messageId)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {showRecallButton && (
                <button
                    className={styles.recallBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        void onRecall();
                    }}
                    title="Recall message"
                >
                    <i className="fas fa-undo-alt" />
                </button>
            )}

            {children}

            {contextMenu && (
                <MessageContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    anchorRect={contextMenu.anchorRect}
                    preferredSide={contextMenu.preferredSide}
                    isOwn={contextMenuProps.isOwn}
                    canRecall={contextMenuProps.canRecall}
                    messageContent={contextMenuProps.messageContent}
                    messageId={contextMenuProps.messageId}
                    onClose={contextMenuProps.onClose}
                    onCopy={contextMenuProps.onCopy}
                    onQuote={contextMenuProps.onQuote}
                    onRecall={contextMenuProps.onRecall}
                    onMultiSelect={contextMenuProps.onMultiSelect}
                />
            )}
        </>
    );
}

function MessageBubble({
    message,
    isOwn,
    showSender,
    multiSelect,
    selected,
    onToggleSelect,
    onQuote,
    onEnterMultiSelect,
    onTransfer,
}: Props) {
    const [hovering, setHovering] = useState(false);
    const [canRecallAtInteraction, setCanRecallAtInteraction] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const recallMsg = useChatStore((s) => s.recallMessage);

    const isFile = message.messageType === 'file';
    const isImage = isFile && isImageFile(message.mimeType, message.fileName);
    const fileUrl = chatApi.toAbsoluteFileUrl(message.fileUrl || '');
    const isPersistedMessage = !String(message.id || '').startsWith('optimistic-');
    const canTransfer = Boolean(onTransfer && !multiSelect && isPersistedMessage && !message.failed);
    const canRecall = canRecallAtInteraction;
    const canOpenMenu = !multiSelect && !message.recalled && message.type !== 'system';
    const showRecallButton = !multiSelect && isOwn && canRecall && hovering;

    const isRecallableNow = useCallback(() => {
        if (!isOwn || message.recalled) return false;
        const sentAt = new Date(message.sentAt).getTime();
        if (Number.isNaN(sentAt)) return false;
        return Date.now() - sentAt < 120000;
    }, [isOwn, message.recalled, message.sentAt]);

    const handleRecall = useCallback(async () => {
        try {
            await chatApi.recallMessage(message.id);
            recallMsg(message.roomId, message.id);
        } catch {
            // silently ignore
        }
    }, [message.id, message.roomId, recallMsg]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(message.content || '').catch(() => {});
    }, [message.content]);

    const openContextMenu = useCallback((fallbackPoint?: { x: number; y: number }) => {
        const nextState = buildContextMenuState(bubbleRef.current, isOwn, fallbackPoint);
        if (nextState) {
            setContextMenu(nextState);
        }
    }, [isOwn]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canOpenMenu) return;
        setCanRecallAtInteraction(isRecallableNow());
        openContextMenu({ x: e.clientX, y: e.clientY });
    }, [canOpenMenu, isRecallableNow, openContextMenu]);

    const handleBubbleClick = useCallback((e: React.MouseEvent) => {
        if (!canOpenMenu) return;
        e.stopPropagation();
        setCanRecallAtInteraction(isRecallableNow());
        openContextMenu();
    }, [canOpenMenu, isRecallableNow, openContextMenu]);

    const handleClick = useCallback(() => {
        if (multiSelect && !message.recalled && message.type !== 'system') {
            onToggleSelect(message.id);
        }
    }, [message.id, message.recalled, message.type, multiSelect, onToggleSelect]);

    const handleDownload = useCallback<React.MouseEventHandler<HTMLElement>>(async (e) => {
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
    }, [fileUrl, message.fileName, message.fileUrl, message.mimeType]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleQuote = useCallback(() => {
        onQuote(message);
    }, [message, onQuote]);

    const handleEnterMultiSelectMode = useCallback(() => {
        onEnterMultiSelect(message.id);
    }, [message.id, onEnterMultiSelect]);

    const handleMouseEnter = useCallback(() => {
        setHovering(true);
        setCanRecallAtInteraction(isRecallableNow());
    }, [isRecallableNow]);

    const handleMouseLeave = useCallback(() => {
        setHovering(false);
    }, []);

    if (message.type === 'system') {
        return renderSystemMessage(message.content);
    }

    if (message.recalled) {
        return renderRecalledMessage(isOwn, message.senderName);
    }

    return (
        <div
            className={`${styles.messageRow} ${isOwn ? styles.messageRowOwn : styles.messageRowOther} ${multiSelect ? styles.messageRowMultiSelect : ''} ${selected ? styles.messageRowSelected : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
            onClick={handleClick}
        >
            <MessageBubbleActions
                multiSelect={multiSelect}
                selected={selected}
                messageId={message.id}
                onToggleSelect={onToggleSelect}
                showRecallButton={showRecallButton}
                onRecall={handleRecall}
                contextMenu={contextMenu}
                contextMenuProps={{
                    isOwn,
                    canRecall,
                    messageContent: message.content || '',
                    messageId: message.id,
                    onClose: handleCloseContextMenu,
                    onCopy: handleCopy,
                    onQuote: handleQuote,
                    onRecall: handleRecall,
                    onMultiSelect: handleEnterMultiSelectMode,
                }}
            >
                <div
                    ref={bubbleRef}
                    className={`${styles.messageBubble} ${isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther}`}
                    onClick={handleBubbleClick}
                >
                    <MessageBubbleHeader
                        isOwn={isOwn}
                        showSender={showSender}
                        senderName={message.senderName}
                        forwardedFrom={message.forwardedFrom}
                        replyTo={message.replyTo}
                    />
                    <MessageBubbleBody
                        message={message}
                        isFile={isFile}
                        isImage={isImage}
                        fileUrl={fileUrl}
                        canTransfer={canTransfer}
                        onDownload={handleDownload}
                        onTransfer={onTransfer}
                    />
                    <MessageBubbleStatus sentAt={message.sentAt} />
                </div>
            </MessageBubbleActions>
        </div>
    );
}

export default memo(MessageBubble, (prevProps, nextProps) => {
    return (
        prevProps.message === nextProps.message &&
        prevProps.isOwn === nextProps.isOwn &&
        prevProps.showSender === nextProps.showSender &&
        prevProps.multiSelect === nextProps.multiSelect &&
        prevProps.selected === nextProps.selected &&
        prevProps.onToggleSelect === nextProps.onToggleSelect &&
        prevProps.onQuote === nextProps.onQuote &&
        prevProps.onEnterMultiSelect === nextProps.onEnterMultiSelect &&
        prevProps.onTransfer === nextProps.onTransfer
    );
});
