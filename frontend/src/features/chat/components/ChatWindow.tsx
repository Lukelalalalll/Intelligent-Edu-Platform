// frontend/src/features/chat/components/ChatWindow.tsx
import React, { Suspense, lazy, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { useChatRoom } from '../hooks/useChatRoom';
import { useChatStore } from '../store/chatStore';
import type { ChatMessage } from '../types';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/MultiSelect.module.css';

const styles = {
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
    ...modalStyles,
};

const ForwardModal = lazy(() => import('./ForwardModal'));
const AssistantPanel = lazy(() => import('./AssistantPanel'));
const TransferModal = lazy(() => import('./TransferModal'));
const GroupInfoPanel = lazy(() => import('./GroupInfoPanel'));

interface Props {
    roomId: string;
}

export default function ChatWindow({ roomId }: Props) {
    const wsStatus = useChatStore((state) => state.wsStatus);
    const navigate = useNavigate();
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());
    const [showAssistant, setShowAssistant] = useState(false);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [transferMessage, setTransferMessage] = useState<ChatMessage | null>(null);

    const {
        room, roomMessages, userId,
        typingUser, multiSelect, selectedIds, quotedMessage, showForwardModal, batchDeleting,
        hasNewMessage, initialLoading,
        messagesAreaRef, loadingMore,
        handleToggleSelect, handleEnterMultiSelect, handleExitMultiSelect,
        handleBatchDelete, handleQuote, handleClearQuote,
        handleSend, handleRetry, handleTyping, scrollToBottom, setShowForwardModal,
    } = useChatRoom(roomId);

    // eslint-disable-next-line react-hooks/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: roomMessages.length,
        getScrollElement: () => messagesAreaRef.current,
        estimateSize: () => 108,
        overscan: 8,
        getItemKey: (index) => roomMessages[index]?.id ?? index,
    });

    const handleToggleAssistant = useCallback(() => setShowAssistant(prev => !prev), []);
    const handleToggleGroupInfo = useCallback(() => setShowGroupInfo(prev => !prev), []);
    const handleTransfer = useCallback((msg: ChatMessage) => setTransferMessage(msg), []);
    const handleLeaveOrDelete = useCallback(() => {
        navigate('/chat');
    }, [navigate]);

    const handleProviderChange = useCallback((next: AIProvider) => {
        setProvider(next);
        setStoredAIProvider(next);
    }, []);

    if (!room) {
        return (
            <div className={styles.rightPaneEmpty}>
                <i className={`fas fa-spinner fa-spin ${styles.rightPaneEmptyIcon}`} />
            </div>
        );
    }

    return (
        <>
            <ChatHeader
                room={room}
                typingUser={typingUser}
                provider={provider}
                onProviderChange={handleProviderChange}
                onToggleAssistant={handleToggleAssistant}
                onToggleGroupInfo={handleToggleGroupInfo}
            />

            {wsStatus === 'closed' && (
                <div className={styles.wsBanner}>
                    <i className="fas fa-exclamation-triangle" />
                    &nbsp; Real-time connection lost — messages will be sent via REST fallback
                </div>
            )}
            {wsStatus === 'connecting' && (
                <div className={`${styles.wsBanner} ${styles.wsBannerConnecting}`}>
                    <i className="fas fa-circle-notch fa-spin" />
                    &nbsp; Connecting…
                </div>
            )}

            {initialLoading ? (
                <div className={styles.chatLoadingState}>
                    <i className="fas fa-circle-notch fa-spin" />
                    <span className={styles.chatLoadingTitle}>
                        {wsStatus === 'closed' ? 'Waiting for network...' : 'Loading chat history...'}
                    </span>
                    <span className={styles.chatLoadingHint}>
                        {wsStatus === 'closed'
                            ? 'Messages and file actions will be available after reconnection.'
                            : 'Preparing complete room data, please wait.'}
                    </span>
                </div>
            ) : (
                <div className={styles.messagesArea} ref={messagesAreaRef}>
                    {loadingMore && (
                        <div style={{ textAlign: 'center', padding: 8, color: '#94a3b8', fontSize: '0.8rem' }}>
                            Loading...
                        </div>
                    )}
                    {roomMessages.length === 0 ? (
                        <div className={styles.emptyState} style={{ marginTop: 24 }}>
                            <i className={`fas fa-user-check ${styles.emptyStateIcon}`} />
                            <span className={styles.emptyStateText}>Added friend successfully. Start your conversation here.</span>
                        </div>
                    ) : (
                        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                                const msg = roomMessages[virtualItem.index];
                                const prev = virtualItem.index > 0 ? roomMessages[virtualItem.index - 1] : null;
                                const showSender = room.type === 'group' && msg.senderId !== userId && msg.senderId !== prev?.senderId;
                                return (
                                    <div
                                        key={msg.id}
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
                                        <MessageBubble
                                            message={msg}
                                            isOwn={msg.senderId === userId}
                                            showSender={showSender}
                                            multiSelect={multiSelect}
                                            selected={selectedIds.has(msg.id)}
                                            onToggleSelect={handleToggleSelect}
                                            onQuote={handleQuote}
                                            onEnterMultiSelect={handleEnterMultiSelect}
                                            onTransfer={msg.messageType === 'file' ? handleTransfer : undefined}
                                        />
                                        {msg.failed && (
                                            <div className={styles.failedMsgRow}>
                                                <i className="fas fa-exclamation-circle" />
                                                <span>Failed to send</span>
                                                <button onClick={() => handleRetry(msg)}>Retry</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {typingUser && (
                        <div className={styles.typingIndicator}>
                            <span>{typingUser}</span>
                            <span className={styles.typingDots}><span /><span /><span /></span>
                        </div>
                    )}
                </div>
            )}

            {hasNewMessage && !initialLoading && (
                <button className={styles.newMessageBanner} onClick={scrollToBottom}>
                    <i className="fas fa-arrow-down" />
                    &nbsp; New messages
                </button>
            )}

            {initialLoading ? (
                <div className={styles.chatLoadingInputBlock}>
                    <i className="fas fa-lock" />
                    <span>Message actions are disabled until room data is ready.</span>
                </div>
            ) : multiSelect ? (
                <div className={styles.multiSelectToolbar}>
                    <button className={styles.multiSelectToolbarBtn} onClick={handleExitMultiSelect}>
                        <i className="fas fa-times" /><span>Cancel</span>
                    </button>
                    <span className={styles.multiSelectCount}>{selectedIds.size} selected</span>
                    <button
                        className={`${styles.multiSelectToolbarBtn} ${styles.multiSelectToolbarBtnDanger}`}
                        onClick={handleBatchDelete}
                        disabled={selectedIds.size === 0 || batchDeleting}
                    >
                        <i className={batchDeleting ? 'fas fa-circle-notch fa-spin' : 'fas fa-trash-alt'} />
                        <span>Delete</span>
                    </button>
                    <button
                        className={styles.multiSelectToolbarBtn}
                        onClick={() => setShowForwardModal(true)}
                        disabled={selectedIds.size === 0}
                    >
                        <i className="fas fa-share" /><span>Forward</span>
                    </button>
                </div>
            ) : (
                <MessageInput
                    roomId={roomId}
                    provider={provider}
                    onSend={handleSend}
                    onTyping={handleTyping}
                    quotedMessage={quotedMessage}
                    onClearQuote={handleClearQuote}
                />
            )}

            <Suspense fallback={null}>
                {showForwardModal && (
                    <ForwardModal
                        messageIds={Array.from(selectedIds)}
                        onClose={() => setShowForwardModal(false)}
                        onDone={() => { setShowForwardModal(false); handleExitMultiSelect(); }}
                    />
                )}
            </Suspense>

            <Suspense fallback={null}>
                {showAssistant && (
                    <AssistantPanel
                        roomId={roomId}
                        provider={provider}
                        visible={showAssistant}
                        onClose={() => setShowAssistant(false)}
                    />
                )}
            </Suspense>

            <Suspense fallback={null}>
                {transferMessage && (
                    <TransferModal
                        message={transferMessage}
                        roomId={roomId}
                        onClose={() => setTransferMessage(null)}
                    />
                )}
            </Suspense>

            <Suspense fallback={null}>
                {showGroupInfo && (
                    <GroupInfoPanel
                        roomId={roomId}
                        visible={showGroupInfo}
                        onClose={() => setShowGroupInfo(false)}
                        onLeaveOrDelete={handleLeaveOrDelete}
                    />
                )}
            </Suspense>
        </>
    );
}
