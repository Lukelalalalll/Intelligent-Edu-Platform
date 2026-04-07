// frontend/src/features/chat/components/ChatWindow.tsx
import React from 'react';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ForwardModal from './ForwardModal';
import { useChatRoom } from '../hooks/useChatRoom';
import { useChatStore } from '../store/chatStore';
import styles from '../styles/Chat.module.css';

interface Props {
    roomId: string;
}

export default function ChatWindow({ roomId }: Props) {
    const { wsStatus } = useChatStore();

    const {
        room, roomMessages, userId,
        typingUser, multiSelect, selectedIds, quotedMessage, showForwardModal, batchDeleting,
        hasNewMessage,
        messagesEndRef, messagesTopRef, messagesAreaRef, loadingMore,
        handleToggleSelect, handleEnterMultiSelect, handleExitMultiSelect,
        handleBatchDelete, handleQuote, handleClearQuote,
        handleSend, handleRetry, handleTyping, scrollToBottom, setShowForwardModal,
    } = useChatRoom(roomId);

    if (!room) {
        return (
            <div className={styles.rightPaneEmpty}>
                <i className={`fas fa-spinner fa-spin ${styles.rightPaneEmptyIcon}`} />
            </div>
        );
    }

    return (
        <>
            <ChatHeader room={room} typingUser={typingUser} />

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

            <div className={styles.messagesArea} ref={messagesAreaRef}>
                <div ref={messagesTopRef} className={styles.loadMoreTrigger} />
                {loadingMore && (
                    <div style={{ textAlign: 'center', padding: 8, color: '#94a3b8', fontSize: '0.8rem' }}>
                        Loading...
                    </div>
                )}
                {roomMessages.map((msg, idx) => {
                    const prev = idx > 0 ? roomMessages[idx - 1] : null;
                    const showSender = room.type === 'group' && msg.senderId !== userId && msg.senderId !== prev?.senderId;
                    return (
                        <React.Fragment key={msg.id}>
                            <MessageBubble
                                message={msg}
                                isOwn={msg.senderId === userId}
                                showSender={showSender}
                                multiSelect={multiSelect}
                                selected={selectedIds.has(msg.id)}
                                onToggleSelect={handleToggleSelect}
                                onQuote={handleQuote}
                                onEnterMultiSelect={handleEnterMultiSelect}
                            />
                            {msg.failed && (
                                <div className={styles.failedMsgRow}>
                                    <i className="fas fa-exclamation-circle" />
                                    <span>Failed to send</span>
                                    <button onClick={() => handleRetry(msg)}>Retry</button>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}

                {typingUser && (
                    <div className={styles.typingIndicator}>
                        <span>{typingUser}</span>
                        <span className={styles.typingDots}><span /><span /><span /></span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {hasNewMessage && (
                <button className={styles.newMessageBanner} onClick={scrollToBottom}>
                    <i className="fas fa-arrow-down" />
                    &nbsp; New messages
                </button>
            )}

            {multiSelect ? (
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
                    onSend={handleSend}
                    onTyping={handleTyping}
                    quotedMessage={quotedMessage}
                    onClearQuote={handleClearQuote}
                />
            )}

            {showForwardModal && (
                <ForwardModal
                    messageIds={Array.from(selectedIds)}
                    onClose={() => setShowForwardModal(false)}
                    onDone={() => { setShowForwardModal(false); handleExitMultiSelect(); }}
                />
            )}
        </>
    );
}
