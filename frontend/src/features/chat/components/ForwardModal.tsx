import React, { useState } from 'react';
import styles from '../styles/Chat.module.css';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../../../api/chatApi';
import type { ChatRoom } from '../types';

interface Props {
    messageIds: string[];
    onClose: () => void;
    onDone: () => void;
}

export default function ForwardModal({ messageIds, onClose, onDone }: Props) {
    const rooms = useChatStore((s) => s.rooms);
    const [search, setSearch] = useState('');
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [forwarding, setForwarding] = useState(false);

    const filteredRooms = rooms.filter((r) => {
        const name = r.name || '';
        return name.toLowerCase().includes(search.toLowerCase());
    });

    const handleForward = async () => {
        if (!selectedRoomId) return;
        setForwarding(true);
        try {
            await chatApi.forwardMessages(selectedRoomId, messageIds);
            onDone();
        } catch {
            // ignore
        } finally {
            setForwarding(false);
        }
    };

    const getAvatar = (room: ChatRoom) => {
        const name = room.name || '?';
        const letter = name.charAt(0).toUpperCase();
        return (
            <div
                className={styles.avatar}
                style={{ background: room.avatarColor || '#64748b', width: 36, height: 36, fontSize: '0.95rem' }}
            >
                {letter}
            </div>
        );
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>
                        Forward {messageIds.length} message{messageIds.length > 1 ? 's' : ''}
                    </h3>
                    <button className={styles.modalClose} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    <input
                        className={styles.inputField}
                        placeholder="Search chats..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <div className={styles.forwardRoomList}>
                        {filteredRooms.map((room) => (
                            <div
                                key={room.id}
                                className={`${styles.forwardRoomItem} ${selectedRoomId === room.id ? styles.forwardRoomItemSelected : ''}`}
                                onClick={() => setSelectedRoomId(room.id)}
                            >
                                {getAvatar(room)}
                                <div className={styles.forwardRoomName}>
                                    {room.name || 'Direct Chat'}
                                </div>
                                {selectedRoomId === room.id && (
                                    <i className="fas fa-check-circle" style={{ color: '#007B55', marginLeft: 'auto' }} />
                                )}
                            </div>
                        ))}
                        {filteredRooms.length === 0 && (
                            <div className={styles.modalEmpty}>No chats found</div>
                        )}
                    </div>
                </div>

                <div className={styles.modalFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
                    <button
                        className={styles.btnPrimary}
                        onClick={handleForward}
                        disabled={!selectedRoomId || forwarding}
                    >
                        {forwarding ? 'Forwarding...' : 'Forward'}
                    </button>
                </div>
            </div>
        </div>
    );
}
