// frontend/src/features/chat/components/ContactItem.tsx

import React from 'react';
import type { ChatRoom } from '../types';
import { useChatStore } from '../store/chatStore';
import styles from '../styles/components/Sidebar.module.css';

interface Props {
    room: ChatRoom;
    isActive: boolean;
    currentUserId: string;
    onClick: () => void;
}

function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = ((hash % 360) + 360) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

function formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
        return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ContactItem({ room, isActive, currentUserId, onClick }: Props) {
    // Read unread count directly from store via selector (same pattern as sidebar badge)
    const unreadCount = useChatStore((s) => s.unreadCounts[room.id] ?? 0);
    const displayName = room.name || 'Chat';
    const initial = displayName.charAt(0).toUpperCase();
    const color = room.avatarColor || hashColor(room.id);
    const lastMsg = room.lastMessage;
    const hasUnread = unreadCount > 0;

    // Read receipt: only show for own last messages
    const isOwnLastMsg = lastMsg?.senderId === currentUserId;
    let readTick: 'none' | 'sent' | 'read' = 'none';
    if (isOwnLastMsg && lastMsg) {
        const readBy = lastMsg.readBy ?? [];
        const otherMembers = room.members.filter((m) => m !== currentUserId);
        readTick = otherMembers.length > 0 && otherMembers.every((m) => readBy.includes(m))
            ? 'read'   // all others have read
            : 'sent';  // only sender has it so far
    }

    return (
        <div
            className={`${styles.contactItem} ${isActive ? styles.contactItemActive : ''} ${hasUnread ? styles.contactItemUnread : ''}`}
            onClick={onClick}
        >
            <div className={styles.avatar} style={{ background: color }}>
                {room.type === 'group' ? (
                    <i className="fas fa-users" style={{ fontSize: '0.85rem' }} />
                ) : (
                    initial
                )}
            </div>

            <div className={styles.contactInfo}>
                <div className={`${styles.contactName} ${hasUnread ? styles.contactNameUnread : ''}`}>{displayName}</div>
                {lastMsg && (
                    <div className={`${styles.contactLastMsg} ${hasUnread ? styles.contactLastMsgUnread : ''}`}>
                        {readTick !== 'none' && (
                            <span className={`${styles.readTick} ${readTick === 'read' ? styles.readTickRead : styles.readTickSent}`}>
                                <i className="fas fa-check-double" />
                            </span>
                        )}
                        {lastMsg.content}
                    </div>
                )}
            </div>

            <div className={styles.contactMeta}>
                {unreadCount > 0 && (
                    <div className={styles.contactItemUnreadBadge}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                )}
                {lastMsg?.sentAt && (
                    <div className={`${styles.contactTime} ${hasUnread ? styles.contactTimeUnread : ''}`}>{formatTime(lastMsg.sentAt)}</div>
                )}
            </div>
        </div>
    );
}
