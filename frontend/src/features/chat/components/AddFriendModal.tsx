// frontend/src/features/chat/components/AddFriendModal.tsx

import React, { useState, useCallback } from 'react';
import { chatApi } from '../../../api/chatApi';
import { useChatStore } from '../store/chatStore';
import type { ChatContact } from '../types';
import styles from '../styles/Chat.module.css';

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

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
                            <div className={styles.emptyState}>
                                <span className={styles.emptyStateText}>No users found</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
