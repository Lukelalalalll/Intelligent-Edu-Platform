// frontend/src/features/chat/components/CreateGroupModal.tsx

import React, { useState, useCallback } from 'react';
import { chatApi } from '../../../api/chatApi';
import { useChatStore } from '../store/chatStore';
import styles from '../styles/Chat.module.css';

interface Props {
    onClose: () => void;
    onCreated: (roomId: string) => void;
}

export default function CreateGroupModal({ onClose, onCreated }: Props) {
    const { contacts } = useChatStore();
    const [groupName, setGroupName] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const toggleMember = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleCreate = useCallback(async () => {
        if (!groupName.trim()) {
            setError('Group name is required');
            return;
        }
        if (selectedIds.size < 2) {
            setError('Select at least 2 members');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await chatApi.createGroupRoom(groupName.trim(), Array.from(selectedIds));
            // Refresh rooms
            const roomsRes = await chatApi.getRooms();
            useChatStore.getState().setRooms(roomsRes.rooms);
            onCreated(res.roomId);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to create group');
        } finally {
            setLoading(false);
        }
    }, [groupName, selectedIds, onCreated]);

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>Create Group Chat</h3>
                    <button className={styles.modalClose} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    <input
                        className={styles.inputField}
                        placeholder="Group name"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                    />

                    {error && (
                        <div style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 8 }}>{error}</div>
                    )}

                    <div className={styles.memberCheckList}>
                        {contacts.length === 0 ? (
                            <div className={styles.emptyState}>
                                <span className={styles.emptyStateText}>Add friends first to create a group</span>
                            </div>
                        ) : (
                            contacts.map((c) => (
                                <label key={c.id} className={styles.memberCheckItem}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(c.id)}
                                        onChange={() => toggleMember(c.id)}
                                    />
                                    <div
                                        className={styles.avatar}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            fontSize: '0.7rem',
                                            background: `hsl(${(c.username.charCodeAt(0) * 37) % 360}, 55%, 45%)`,
                                        }}
                                    >
                                        {c.username.charAt(0).toUpperCase()}
                                    </div>
                                    <span className={styles.memberCheckName}>{c.username}</span>
                                    <span className={styles.memberCheckRole}>{c.role}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>

                <div className={styles.modalFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={styles.btnPrimary}
                        onClick={handleCreate}
                        disabled={loading || !groupName.trim() || selectedIds.size < 2}
                    >
                        {loading ? 'Creating...' : `Create (${selectedIds.size} selected)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
