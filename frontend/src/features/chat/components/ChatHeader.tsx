// frontend/src/features/chat/components/ChatHeader.tsx

import React from 'react';
import type { ChatRoom } from '../types';
import styles from '../styles/Chat.module.css';

interface Props {
    room: ChatRoom;
    typingUser: string | null;
    onToggleAssistant?: () => void;
    onToggleGroupInfo?: () => void;
}

function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = ((hash % 360) + 360) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

export default function ChatHeader({ room, typingUser, onToggleAssistant, onToggleGroupInfo }: Props) {
    const displayName = room.name || 'Chat';
    const initial = displayName.charAt(0).toUpperCase();
    const color = room.avatarColor || hashColor(room.id);

    return (
        <div className={styles.chatHeader}>
            <div className={styles.avatar} style={{ background: color, width: 38, height: 38, fontSize: '0.9rem' }}>
                {room.type === 'group' ? (
                    <i className="fas fa-users" style={{ fontSize: '0.8rem' }} />
                ) : (
                    initial
                )}
            </div>
            <div className={styles.chatHeaderInfo}>
                <div className={styles.chatHeaderName}>{displayName}</div>
                <div className={styles.chatHeaderSub}>
                    {typingUser
                        ? `${typingUser} is typing...`
                        : room.type === 'group'
                            ? `${room.members.length} members`
                            : 'Direct message'}
                </div>
            </div>
            <div className={styles.chatHeaderActions}>
                {onToggleAssistant && (
                    <button
                        className={styles.chatHeaderBtn}
                        onClick={onToggleAssistant}
                        title="AI Assistant"
                    >
                        <i className="fas fa-robot" />
                    </button>
                )}
                {onToggleGroupInfo && (
                    <button
                        className={styles.chatHeaderBtn}
                        onClick={onToggleGroupInfo}
                        title="Chat Info"
                    >
                        <i className="fas fa-info-circle" />
                    </button>
                )}
            </div>
        </div>
    );
}
