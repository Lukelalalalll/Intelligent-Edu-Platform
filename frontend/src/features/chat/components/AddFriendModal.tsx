// frontend/src/features/chat/components/AddFriendModal.tsx

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { chatApi } from '../../../api/chatApi';
import { useChatStore } from '../store/chatStore';
import type { ChatContact } from '../types';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/Modals.module.css';
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
    ...searchResultsStyles,
};

interface Props {
    onClose: () => void;
}

export default function AddFriendModal({ onClose }: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ChatContact[]>([]);
    const [loading, setLoading] = useState(false);
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');
    const { contacts } = useChatStore();

    const existingIds = new Set(contacts.map((c) => c.id));

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await chatApi.searchUsers(query.trim());
            setResults(res.users);
        } catch {
            setError('Search failed');
        } finally {
            setLoading(false);
        }
    }, [query]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleSearch();
        },
        [handleSearch],
    );

    const handleAdd = useCallback(async (username: string, userId: string) => {
        try {
            await chatApi.sendFriendRequest(username);
            setSentIds((prev) => new Set(prev).add(userId));
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to send request');
        }
    }, []);

    return createPortal(
        <motion.div 
            className={styles.modalOverlay} 
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div 
                className={styles.modal} 
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>Add Friend</h3>
                    <button className={styles.modalClose} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className={styles.inputField}
                            placeholder="Search by username..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            className={styles.btnPrimary}
                            onClick={handleSearch}
                            disabled={loading || !query.trim()}
                        >
                            {loading ? <i className="fas fa-spinner fa-spin" /> : 'Search'}
                        </button>
                    </div>

                    {error && (
                        <div style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 8 }}>{error}</div>
                    )}

                    <div style={{ marginTop: 12 }}>
                        {results.map((user) => {
                            const isFriend = existingIds.has(user.id);
                            const isSent = sentIds.has(user.id);
                            return (
                                <div key={user.id} className={styles.searchResultItem}>
                                    <div className={styles.searchResultInfo}>
                                        <div
                                            className={styles.avatar}
                                            style={{
                                                width: 32,
                                                height: 32,
                                                fontSize: '0.8rem',
                                                background: `hsl(${(user.username.charCodeAt(0) * 37) % 360}, 55%, 45%)`,
                                            }}
                                        >
                                            {user.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className={styles.searchResultName}>{user.username}</div>
                                            <div className={styles.searchResultRole}>{user.role}</div>
                                        </div>
                                    </div>
                                    {isFriend ? (
                                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Already friends</span>
                                    ) : isSent ? (
                                        <span style={{ fontSize: '0.78rem', color: '#16a34a' }}>Request sent</span>
                                    ) : (
                                        <button
                                            className={`${styles.btnSmall} ${styles.btnAdd}`}
                                            onClick={() => handleAdd(user.username, user.id)}
                                        >
                                            Add
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {results.length === 0 && query && !loading && (
                            <div className={styles.modalEmpty}>
                                <span>No users found</span>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
