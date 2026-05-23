// frontend/src/features/chat/components/GroupInfoPanel.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '../api';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '@/shared/store/useAuthStore';
import type { ChatContact, ChatRoom } from '../types';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/GroupInfoPanel.module.css';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...sidebarStyles,
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
    ...modalStyles,
};

interface Props {
    roomId: string;
    visible: boolean;
    onClose: () => void;
    onLeaveOrDelete?: () => void;
}

function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = ((hash % 360) + 360) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

interface MemberPopup {
    member: ChatContact;
    isFriend: boolean;
    isSelf: boolean;
    isRoomOwner: boolean;
    addFriendSent: boolean;
}

export default function GroupInfoPanel({ roomId, visible, onClose, onLeaveOrDelete }: Props) {
    const [room, setRoom] = useState<ChatRoom | null>(null);
    const [members, setMembers] = useState<ChatContact[]>([]);
    const [isOwner, setIsOwner] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [friendSearch, setFriendSearch] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [memberPopup, setMemberPopup] = useState<MemberPopup | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const contacts = useChatStore((s) => s.contacts);
    const currentUserId = useAuthStore((s) => s.user)?.id ? String(useAuthStore((s) => s.user)?.id) : '';

    const loadRoomInfo = useCallback(async () => {
        setLoading(true);
        try {
            const res = await chatApi.getRoomInfo(roomId);
            setRoom(res.room);
            setMembers(res.members);
            setIsOwner(res.isOwner);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [roomId]);

    useEffect(() => {
        if (visible) loadRoomInfo();
    }, [visible, loadRoomInfo]);

    // Listen for room_updated WS events
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.roomId === roomId) loadRoomInfo();
        };
        window.addEventListener('chat_room_updated', handler);
        return () => window.removeEventListener('chat_room_updated', handler);
    }, [roomId, loadRoomInfo]);

    const handleKick = useCallback(async (userId: string) => {
        setActionLoading(userId);
        try {
            await chatApi.kickRoomMember(roomId, userId);
            setMemberPopup(null);
            await loadRoomInfo();
        } catch { /* ignore */ }
        finally { setActionLoading(null); }
    }, [roomId, loadRoomInfo]);

    const handleAddMember = useCallback(async (userId: string) => {
        setActionLoading(userId);
        try {
            await chatApi.addRoomMember(roomId, userId);
            await loadRoomInfo();
            setShowAddMember(false);
            setFriendSearch('');
        } catch { /* ignore */ }
        finally { setActionLoading(null); }
    }, [roomId, loadRoomInfo]);

    const handleLeave = useCallback(async () => {
        if (!confirm('Are you sure you want to leave this group?')) return;
        try {
            await chatApi.leaveRoom(roomId);
            onLeaveOrDelete?.();
        } catch { /* ignore */ }
    }, [roomId, onLeaveOrDelete]);

    const handleDeleteChat = useCallback(async () => {
        const msg = isOwner
            ? 'Delete this group? All messages will be permanently removed for all members.'
            : 'Delete this conversation? It will be hidden from your chat list.';
        if (!confirm(msg)) return;
        try {
            await chatApi.deleteRoom(roomId);
            onLeaveOrDelete?.();
        } catch { /* ignore */ }
    }, [roomId, isOwner, onLeaveOrDelete]);

    const handleSendFriendRequest = useCallback(async (username: string) => {
        setActionLoading(username);
        try {
            await chatApi.sendFriendRequest(username);
            // Mark as sent in popup
            setMemberPopup((prev) => prev ? { ...prev, addFriendSent: true } : prev);
        } catch { /* ignore */ }
        finally { setActionLoading(null); }
    }, []);

    const handleAvatarClick = useCallback((member: ChatContact) => {
        const isFriend = contacts.some((c) => c.id === member.id);
        const isSelf = member.id === currentUserId;
        const isRoomOwner = member.id === room?.createdBy;
        setMemberPopup({ member, isFriend, isSelf, isRoomOwner, addFriendSent: false });
    }, [contacts, currentUserId, room]);

    if (!visible) return null;

    const memberIds = new Set(members.map((m) => m.id));
    const availableFriends = contacts.filter(
        (c) => !memberIds.has(c.id) && c.username.toLowerCase().includes(friendSearch.toLowerCase()),
    );

    const isGroup = room?.type === 'group';

    return (
        <>
            {/* Backdrop — click anywhere outside panel to close */}
            <div
                className={styles.groupInfoBackdrop}
                onClick={onClose}
            />

            <div className={styles.groupInfoPanel} ref={panelRef}>
                <div className={styles.groupInfoHeader}>
                    <span className={styles.groupInfoTitle}>
                        {isGroup ? 'Group Info' : 'Chat Info'}
                    </span>
                    <button className={styles.groupInfoCloseBtn} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                {loading ? (
                    <div className={styles.groupInfoLoading}>
                        <i className="fas fa-circle-notch fa-spin" />
                    </div>
                ) : (
                    <div className={styles.groupInfoBody}>
                        {/* Room name + basic info */}
                        <div className={styles.groupInfoSection}>
                            <div className={styles.groupInfoRoomName}>
                                {room?.name || 'Chat'}
                            </div>
                            {isGroup && (
                                <div className={styles.groupInfoMeta}>
                                    {members.length} members
                                    {isOwner && <span className={styles.groupInfoOwnerBadge}>Owner</span>}
                                </div>
                            )}
                        </div>

                        {/* Members list */}
                        <div className={styles.groupInfoSection}>
                            <div className={styles.groupInfoSectionTitle}>
                                <i className="fas fa-users" style={{ marginRight: 6 }} />
                                Members
                            </div>
                            <div className={styles.groupInfoMemberList}>
                                {members.map((member) => {
                                    const isSelf = member.id === currentUserId;
                                    const isRoomOwner = member.id === room?.createdBy;
                                    const color = hashColor(member.username || member.id);

                                    return (
                                        <div key={member.id} className={styles.groupInfoMemberItem}>
                                            {/* Clickable avatar */}
                                            <div
                                                className={`${styles.groupInfoMemberAvatar} ${!isSelf ? styles.groupInfoMemberAvatarClickable : ''}`}
                                                style={{ background: color }}
                                                onClick={() => !isSelf && handleAvatarClick(member)}
                                                title={isSelf ? undefined : 'View profile'}
                                            >
                                                {member.username?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <div className={styles.groupInfoMemberInfo}>
                                                <span className={styles.groupInfoMemberName}>
                                                    {member.username}
                                                    {isSelf && <span className={styles.groupInfoYouTag}> (You)</span>}
                                                    {isRoomOwner && <span className={styles.groupInfoOwnerTag}> 👑</span>}
                                                </span>
                                                <span className={styles.groupInfoMemberRole}>{member.role}</span>
                                            </div>
                                            {/* Owner kick button */}
                                            {isOwner && !isSelf && isGroup && (
                                                <button
                                                    className={`${styles.groupInfoActionBtn} ${styles.groupInfoActionBtnDanger}`}
                                                    onClick={() => handleKick(member.id)}
                                                    disabled={actionLoading === member.id}
                                                    title="Remove from group"
                                                >
                                                    <i className={actionLoading === member.id ? 'fas fa-circle-notch fa-spin' : 'fas fa-user-minus'} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Add member (owner only, group only) */}
                        {isOwner && isGroup && (
                            <div className={styles.groupInfoSection}>
                                {!showAddMember ? (
                                    <button
                                        className={styles.groupInfoAddBtn}
                                        onClick={() => setShowAddMember(true)}
                                    >
                                        <i className="fas fa-user-plus" /> Add Member
                                    </button>
                                ) : (
                                    <div className={styles.groupInfoAddPanel}>
                                        <input
                                            className={styles.groupInfoSearchInput}
                                            placeholder="Search friends..."
                                            value={friendSearch}
                                            onChange={(e) => setFriendSearch(e.target.value)}
                                            autoFocus
                                        />
                                        <div className={styles.groupInfoFriendList}>
                                            {availableFriends.length === 0 ? (
                                                <div className={styles.groupInfoEmpty}>No friends to add</div>
                                            ) : (
                                                availableFriends.map((friend) => (
                                                    <div key={friend.id} className={styles.groupInfoFriendItem}>
                                                        <div
                                                            className={styles.groupInfoMemberAvatar}
                                                            style={{ background: hashColor(friend.username), width: 28, height: 28, fontSize: '0.7rem' }}
                                                        >
                                                            {friend.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className={styles.groupInfoFriendName}>{friend.username}</span>
                                                        <button
                                                            className={styles.groupInfoActionBtn}
                                                            onClick={() => handleAddMember(friend.id)}
                                                            disabled={actionLoading === friend.id}
                                                        >
                                                            <i className={actionLoading === friend.id ? 'fas fa-circle-notch fa-spin' : 'fas fa-plus'} />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <button
                                            className={styles.groupInfoCancelBtn}
                                            onClick={() => { setShowAddMember(false); setFriendSearch(''); }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className={styles.groupInfoSection} style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
                            {isGroup && !isOwner && (
                                <button className={styles.groupInfoDangerBtn} onClick={handleLeave}>
                                    <i className="fas fa-sign-out-alt" /> Leave Group
                                </button>
                            )}
                            <button
                                className={styles.groupInfoDangerBtn}
                                onClick={handleDeleteChat}
                                style={{ marginTop: 8 }}
                            >
                                <i className="fas fa-trash-alt" /> {isOwner && isGroup ? 'Delete Group' : 'Delete Chat'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Member profile popup */}
                {memberPopup && (
                    <div className={styles.memberPopupOverlay} onClick={() => setMemberPopup(null)}>
                        <div className={styles.memberPopup} onClick={(e) => e.stopPropagation()}>
                            <button
                                className={styles.memberPopupClose}
                                onClick={() => setMemberPopup(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                            <div
                                className={styles.memberPopupAvatar}
                                style={{ background: hashColor(memberPopup.member.username) }}
                            >
                                {memberPopup.member.username.charAt(0).toUpperCase()}
                            </div>
                            <div className={styles.memberPopupName}>{memberPopup.member.username}</div>
                            <div className={styles.memberPopupRole}>{memberPopup.member.role}</div>
                            <div className={styles.memberPopupActions}>
                                {!memberPopup.isFriend && !memberPopup.addFriendSent && (
                                    <button
                                        className={styles.memberPopupAddBtn}
                                        onClick={() => handleSendFriendRequest(memberPopup.member.username)}
                                        disabled={actionLoading === memberPopup.member.username}
                                    >
                                        {actionLoading === memberPopup.member.username
                                            ? <><i className="fas fa-circle-notch fa-spin" /> Sending...</>
                                            : <><i className="fas fa-user-plus" /> Add Friend</>
                                        }
                                    </button>
                                )}
                                {(memberPopup.isFriend || memberPopup.addFriendSent) && (
                                    <div className={styles.memberPopupAlreadyFriend}>
                                        <i className="fas fa-check-circle" />
                                        {memberPopup.addFriendSent ? ' Request sent' : ' Already friends'}
                                    </div>
                                )}
                                {isOwner && isGroup && !memberPopup.isRoomOwner && (
                                    <button
                                        className={styles.memberPopupKickBtn}
                                        onClick={() => handleKick(memberPopup.member.id)}
                                        disabled={actionLoading === memberPopup.member.id}
                                    >
                                        {actionLoading === memberPopup.member.id
                                            ? <><i className="fas fa-circle-notch fa-spin" /> Removing...</>
                                            : <><i className="fas fa-user-minus" /> Remove from group</>
                                        }
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
