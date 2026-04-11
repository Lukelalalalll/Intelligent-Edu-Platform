// frontend/src/features/chat/components/ContactList.tsx

import React from 'react';
import ContactItem from './ContactItem';
import { useChatStore } from '../store/chatStore';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { LeftPaneTab } from '../pages/ChatPage';
import styles from '../styles/components/Sidebar.module.css';

interface Props {
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onSelectRoom: (roomId: string) => void;
    onOpenDirect: (contactId: string) => void;
    onAddFriend: () => void;
    onCreateGroup: () => void;
    onCreateCourseGroup: () => void;
    onShowRequests: () => void;
    activeTab: LeftPaneTab;
    onTabChange: (tab: LeftPaneTab) => void;
}

function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = ((hash % 360) + 360) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

export default function ContactList({
    searchQuery,
    onSearchChange,
    onSelectRoom,
    onOpenDirect,
    onAddFriend,
    onCreateGroup,
    onCreateCourseGroup,
    onShowRequests,
    activeTab,
    onTabChange,
}: Props) {
    const { rooms, contacts, activeRoomId, pendingRequests, unreadCounts } = useChatStore();

    const currentUser = useCurrentUser();
    const currentUserId = currentUser?.id || '';

    const filteredRooms = searchQuery
        ? rooms.filter((r) =>
              (r.name || '').toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : rooms;

    const filteredContacts = searchQuery
        ? contacts.filter((c) =>
              c.username.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : contacts;

    return (
        <div className={styles.leftPane}>
            {/* Header */}
            <div className={styles.leftHeader}>
                <div className={styles.leftHeaderRow}>
                    <h2 className={styles.leftTitle}>Chat</h2>
                    <div className={styles.headerActions}>
                        <button
                            className={styles.iconBtn}
                            onClick={onAddFriend}
                            title="Add Friend"
                        >
                            <i className="fas fa-user-plus" />
                        </button>
                        <button
                            className={styles.iconBtn}
                            onClick={onCreateGroup}
                            title="New Group"
                        >
                            <i className="fas fa-users" />
                        </button>
                        <button
                            className={styles.iconBtn}
                            onClick={onCreateCourseGroup}
                            title="Course Group"
                        >
                            <i className="fas fa-graduation-cap" />
                        </button>
                    </div>
                </div>
                <div className={styles.searchBox}>
                    <i className={`fas fa-search ${styles.searchIcon}`} />
                    <input
                        className={styles.searchInput}
                        placeholder={activeTab === 'chats' ? 'Search conversations...' : 'Search contacts...'}
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>
            </div>

            {/* Friend requests badge */}
            {pendingRequests.length > 0 && (
                <div className={styles.requestsBadge} onClick={onShowRequests}>
                    <i className="fas fa-user-clock" />
                    <span>Friend Requests</span>
                    <span className={styles.requestsBadgeCount}>{pendingRequests.length}</span>
                </div>
            )}

            {/* Scrollable content area */}
            <div className={styles.roomList}>
                {activeTab === 'chats' ? (
                    filteredRooms.length > 0 ? (
                        filteredRooms.map((room) => (
                            <ContactItem
                                key={room.id}
                                room={room}
                                isActive={room.id === activeRoomId}
                                unreadCount={unreadCounts[room.id] || 0}
                                currentUserId={currentUserId}
                                onClick={() => onSelectRoom(room.id)}
                            />
                        ))
                    ) : (
                        <div className={styles.emptyState}>
                            <i className={`fas fa-comment-slash ${styles.emptyStateIcon}`} />
                            <span className={styles.emptyStateText}>
                                {searchQuery ? 'No matching conversations' : 'No conversations yet'}
                            </span>
                        </div>
                    )
                ) : (
                    /* Contacts tab */
                    filteredContacts.length > 0 ? (
                        filteredContacts.map((contact) => (
                            <div key={contact.id} className={styles.contactItem}>
                                <div
                                    className={styles.avatar}
                                    style={{ background: hashColor(contact.id) }}
                                >
                                    {contact.username.charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.contactInfo}>
                                    <div className={styles.contactName}>{contact.username}</div>
                                    <div className={styles.contactLastMsg}>{contact.role}</div>
                                </div>
                                <button
                                    className={`${styles.btnSmall} ${styles.btnAdd}`}
                                    onClick={() => onOpenDirect(contact.id)}
                                    title="Start chat"
                                >
                                    <i className="fas fa-comment" />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className={styles.emptyState}>
                            <i className={`fas fa-user-slash ${styles.emptyStateIcon}`} />
                            <span className={styles.emptyStateText}>
                                {searchQuery ? 'No matching contacts' : 'No contacts yet'}
                            </span>
                            {!searchQuery && (
                                <button
                                    className={styles.btnPrimary}
                                    style={{ marginTop: 8, fontSize: '0.8rem', padding: '6px 16px' }}
                                    onClick={onAddFriend}
                                >
                                    Add Friend
                                </button>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* Bottom tab switcher */}
            <div className={styles.leftTabBar}>
                <button
                    className={`${styles.leftTabBtn} ${activeTab === 'chats' ? styles.leftTabBtnActive : ''}`}
                    onClick={() => onTabChange('chats')}
                >
                    <i className="fas fa-comments" />
                    <span>Chats</span>
                </button>
                <button
                    className={`${styles.leftTabBtn} ${activeTab === 'contacts' ? styles.leftTabBtnActive : ''}`}
                    onClick={() => onTabChange('contacts')}
                >
                    <i className="fas fa-address-book" />
                    <span>Contacts</span>
                </button>
            </div>
        </div>
    );
}
