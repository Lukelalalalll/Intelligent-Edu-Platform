// frontend/src/features/chat/components/FriendRequestsPanel.tsx

import React, { useCallback } from 'react';
import { chatApi } from '../api';
import { useChatStore } from '../store/chatStore';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/Modals.module.css';
import friendRequestsStyles from '../styles/components/FriendRequestsPanel.module.css';
import searchResultsStyles from '../styles/components/SearchResultsModal.module.css';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...sidebarStyles,
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
    ...modalStyles,
    ...friendRequestsStyles,
    ...searchResultsStyles,
};

interface Props {
    onClose: () => void;
    onAccepted?: (friendUserId: string) => void;
}

export default function FriendRequestsPanel({ onClose, onAccepted }: Props) {
    const { pendingRequests, setPendingRequests, setContacts } = useChatStore();

    const handleAccept = useCallback(async (requestId: string, fromId: string) => {
        try {
            await chatApi.acceptFriendRequest(requestId);
            // Refresh both
            const [reqRes, cRes] = await Promise.all([
                chatApi.getFriendRequests(),
                chatApi.getContacts(),
            ]);
            setPendingRequests(reqRes.requests);
            setContacts(cRes.contacts);
            onAccepted?.(fromId);
        } catch {
            // ignore
        }
    }, [setPendingRequests, setContacts, onAccepted]);

    const handleReject = useCallback(async (requestId: string) => {
        try {
            await chatApi.deleteContact(requestId);
            const reqRes = await chatApi.getFriendRequests();
            setPendingRequests(reqRes.requests);
        } catch {
            // ignore
        }
    }, [setPendingRequests]);

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>Friend Requests</h3>
                    <button className={styles.modalClose} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    {pendingRequests.length === 0 ? (
                        <div className={styles.emptyState}>
                            <i className={`fas fa-user-check ${styles.emptyStateIcon}`} />
                            <span className={styles.emptyStateText}>No pending requests</span>
                        </div>
                    ) : (
                        pendingRequests.map((req) => (
                            <div key={req.id} className={styles.requestItem}>
                                <div className={styles.requestInfo}>
                                    <div
                                        className={styles.avatar}
                                        style={{
                                            width: 34,
                                            height: 34,
                                            fontSize: '0.8rem',
                                            background: `hsl(${(req.fromUsername.charCodeAt(0) * 37) % 360}, 55%, 45%)`,
                                        }}
                                    >
                                        {req.fromUsername.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className={styles.searchResultName}>{req.fromUsername}</div>
                                        <div className={styles.searchResultRole}>{req.fromRole}</div>
                                    </div>
                                </div>
                                <div className={styles.requestActions}>
                                    <button
                                        className={`${styles.btnSmall} ${styles.btnAccept}`}
                                        onClick={() => handleAccept(req.id, req.fromId)}
                                    >
                                        Accept
                                    </button>
                                    <button
                                        className={`${styles.btnSmall} ${styles.btnDanger}`}
                                        onClick={() => handleReject(req.id)}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
