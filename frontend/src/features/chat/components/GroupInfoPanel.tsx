// frontend/src/features/chat/components/GroupInfoPanel.tsx

import React, { useCallback, useEffect, useState } from 'react';
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

interface MemberPopupState {
    member: ChatContact;
    isFriend: boolean;
    isSelf: boolean;
    isRoomOwner: boolean;
    addFriendSent: boolean;
}

interface GroupInfoHeaderProps {
    isGroup: boolean;
    onClose: () => void;
}

interface RoomSummarySectionProps {
    roomName: string | null | undefined;
    isGroup: boolean;
    memberCount: number;
    isOwner: boolean;
}

interface MemberListSectionProps {
    members: ChatContact[];
    currentUserId: string;
    roomOwnerId?: string;
    canManageMembers: boolean;
    actionLoading: string | null;
    onAvatarClick: (member: ChatContact) => void;
    onKick: (userId: string) => void;
}

interface GroupSettingsSectionProps {
    showAddMember: boolean;
    friendSearch: string;
    availableFriends: ChatContact[];
    actionLoading: string | null;
    onShowAddMember: () => void;
    onFriendSearchChange: (value: string) => void;
    onAddMember: (userId: string) => void;
    onCancel: () => void;
}

interface ActionSectionProps {
    canLeaveGroup: boolean;
    canDeleteChat: boolean;
    deleteLabel: string;
    onLeave: () => void;
    onDelete: () => void;
}

interface MemberProfilePopupProps {
    memberPopup: MemberPopupState | null;
    actionLoading: string | null;
    canManageMembers: boolean;
    onClose: () => void;
    onSendFriendRequest: (username: string) => void;
    onKick: (userId: string) => void;
}

function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = ((hash % 360) + 360) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

function isSelfMember(member: ChatContact, currentUserId: string): boolean {
    return member.id === currentUserId;
}

function isRoomOwnerMember(member: ChatContact, roomOwnerId?: string): boolean {
    return member.id === roomOwnerId;
}

function getMemberAvatarColor(member: ChatContact): string {
    return hashColor(member.username || member.id);
}

function getDeleteConfirmMessage(isOwner: boolean): string {
    return isOwner
        ? 'Delete this group? All messages will be permanently removed for all members.'
        : 'Delete this conversation? It will be hidden from your chat list.';
}

function filterAvailableFriends(
    contacts: ChatContact[],
    members: ChatContact[],
    friendSearch: string,
): ChatContact[] {
    const memberIds = new Set(members.map((member) => member.id));
    const normalizedSearch = friendSearch.toLowerCase();

    return contacts.filter(
        (contact) =>
            !memberIds.has(contact.id) &&
            contact.username.toLowerCase().includes(normalizedSearch),
    );
}

function GroupInfoHeader({ isGroup, onClose }: GroupInfoHeaderProps) {
    return (
        <div className={styles.groupInfoHeader}>
            <span className={styles.groupInfoTitle}>
                {isGroup ? 'Group Info' : 'Chat Info'}
            </span>
            <button
                type="button"
                className={styles.groupInfoCloseBtn}
                onClick={onClose}
                aria-label="Close group info"
            >
                <i className="fas fa-times" />
            </button>
        </div>
    );
}

function GroupInfoLoading() {
    return (
        <div className={styles.groupInfoLoading}>
            <i className="fas fa-circle-notch fa-spin" />
        </div>
    );
}

function RoomSummarySection({
    roomName,
    isGroup,
    memberCount,
    isOwner,
}: RoomSummarySectionProps) {
    return (
        <div className={styles.groupInfoSection}>
            <div className={styles.groupInfoRoomName}>
                {roomName || 'Chat'}
            </div>
            {isGroup && (
                <div className={styles.groupInfoMeta}>
                    {memberCount} members
                    {isOwner && <span className={styles.groupInfoOwnerBadge}>Owner</span>}
                </div>
            )}
        </div>
    );
}

function MemberListSection({
    members,
    currentUserId,
    roomOwnerId,
    canManageMembers,
    actionLoading,
    onAvatarClick,
    onKick,
}: MemberListSectionProps) {
    return (
        <div className={styles.groupInfoSection}>
            <div className={styles.groupInfoSectionTitle}>
                <i className="fas fa-users" style={{ marginRight: 6 }} />
                Members
            </div>
            <div className={styles.groupInfoMemberList}>
                {members.map((member) => {
                    const memberIsSelf = isSelfMember(member, currentUserId);
                    const memberIsRoomOwner = isRoomOwnerMember(member, roomOwnerId);
                    const canKickMember = canManageMembers && !memberIsSelf;

                    return (
                        <div key={member.id} className={styles.groupInfoMemberItem}>
                            <div
                                className={`${styles.groupInfoMemberAvatar} ${!memberIsSelf ? styles.groupInfoMemberAvatarClickable : ''}`}
                                style={{ background: getMemberAvatarColor(member) }}
                                onClick={() => !memberIsSelf && onAvatarClick(member)}
                                title={memberIsSelf ? undefined : 'View profile'}
                            >
                                {member.username?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div className={styles.groupInfoMemberInfo}>
                                <span className={styles.groupInfoMemberName}>
                                    {member.username}
                                    {memberIsSelf && <span className={styles.groupInfoYouTag}> (You)</span>}
                                    {memberIsRoomOwner && <span className={styles.groupInfoOwnerTag}> 👑</span>}
                                </span>
                                <span className={styles.groupInfoMemberRole}>{member.role}</span>
                            </div>
                            {canKickMember && (
                                <button
                                    type="button"
                                    className={`${styles.groupInfoActionBtn} ${styles.groupInfoActionBtnDanger}`}
                                    onClick={() => onKick(member.id)}
                                    disabled={actionLoading === member.id}
                                    title="Remove from group"
                                    aria-label={`Remove ${member.username} from group`}
                                >
                                    <i className={actionLoading === member.id ? 'fas fa-circle-notch fa-spin' : 'fas fa-user-minus'} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function GroupSettingsSection({
    showAddMember,
    friendSearch,
    availableFriends,
    actionLoading,
    onShowAddMember,
    onFriendSearchChange,
    onAddMember,
    onCancel,
}: GroupSettingsSectionProps) {
    return (
        <div className={styles.groupInfoSection}>
            {!showAddMember ? (
                <button
                    type="button"
                    className={styles.groupInfoAddBtn}
                    onClick={onShowAddMember}
                >
                    <i className="fas fa-user-plus" /> Add Member
                </button>
            ) : (
                <div className={styles.groupInfoAddPanel}>
                    <input
                        className={styles.groupInfoSearchInput}
                        placeholder="Search friends..."
                        value={friendSearch}
                        onChange={(event) => onFriendSearchChange(event.target.value)}
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
                                        style={{
                                            background: getMemberAvatarColor(friend),
                                            width: 28,
                                            height: 28,
                                            fontSize: '0.7rem',
                                        }}
                                    >
                                        {friend.username.charAt(0).toUpperCase()}
                                    </div>
                                    <span className={styles.groupInfoFriendName}>{friend.username}</span>
                                    <button
                                        type="button"
                                        className={styles.groupInfoActionBtn}
                                        onClick={() => onAddMember(friend.id)}
                                        disabled={actionLoading === friend.id}
                                        aria-label={`Add ${friend.username} to group`}
                                    >
                                        <i className={actionLoading === friend.id ? 'fas fa-circle-notch fa-spin' : 'fas fa-plus'} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                    <button
                        type="button"
                        className={styles.groupInfoCancelBtn}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}

function ActionSection({
    canLeaveGroup,
    canDeleteChat,
    deleteLabel,
    onLeave,
    onDelete,
}: ActionSectionProps) {
    return (
        <div
            className={styles.groupInfoSection}
            style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}
        >
            {canLeaveGroup && (
                <button
                    type="button"
                    className={styles.groupInfoDangerBtn}
                    onClick={onLeave}
                >
                    <i className="fas fa-sign-out-alt" /> Leave Group
                </button>
            )}
            {canDeleteChat && (
                <button
                    type="button"
                    className={styles.groupInfoDangerBtn}
                    onClick={onDelete}
                    style={{ marginTop: 8 }}
                >
                    <i className="fas fa-trash-alt" /> {deleteLabel}
                </button>
            )}
        </div>
    );
}

function MemberProfilePopup({
    memberPopup,
    actionLoading,
    canManageMembers,
    onClose,
    onSendFriendRequest,
    onKick,
}: MemberProfilePopupProps) {
    if (!memberPopup) return null;

    const canKickMember = canManageMembers && !memberPopup.isRoomOwner;

    return (
        <div className={styles.memberPopupOverlay} onClick={onClose}>
            <div className={styles.memberPopup} onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    className={styles.memberPopupClose}
                    onClick={onClose}
                    aria-label="Close profile popup"
                >
                    <i className="fas fa-times" />
                </button>
                <div
                    className={styles.memberPopupAvatar}
                    style={{ background: getMemberAvatarColor(memberPopup.member) }}
                >
                    {memberPopup.member.username.charAt(0).toUpperCase()}
                </div>
                <div className={styles.memberPopupName}>{memberPopup.member.username}</div>
                <div className={styles.memberPopupRole}>{memberPopup.member.role}</div>
                <div className={styles.memberPopupActions}>
                    {!memberPopup.isFriend && !memberPopup.addFriendSent && (
                        <button
                            type="button"
                            className={styles.memberPopupAddBtn}
                            onClick={() => onSendFriendRequest(memberPopup.member.username)}
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
                    {canKickMember && (
                        <button
                            type="button"
                            className={styles.memberPopupKickBtn}
                            onClick={() => onKick(memberPopup.member.id)}
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
    );
}

export default function GroupInfoPanel({
    roomId,
    visible,
    onClose,
    onLeaveOrDelete,
}: Props) {
    const [room, setRoom] = useState<ChatRoom | null>(null);
    const [members, setMembers] = useState<ChatContact[]>([]);
    const [isOwner, setIsOwner] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [friendSearch, setFriendSearch] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [memberPopup, setMemberPopup] = useState<MemberPopupState | null>(null);

    const contacts = useChatStore((state) => state.contacts);
    const currentUser = useAuthStore((state) => state.user);
    const currentUserId = currentUser?.id ? String(currentUser.id) : '';

    const closeMemberPopup = useCallback(() => {
        setMemberPopup(null);
    }, []);

    const closeAddMemberPanel = useCallback(() => {
        setShowAddMember(false);
        setFriendSearch('');
    }, []);

    const refreshRoomInfo = useCallback(async () => {
        setLoading(true);
        try {
            const response = await chatApi.getRoomInfo(roomId);
            setRoom(response.room);
            setMembers(response.members);
            setIsOwner(response.isOwner);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [roomId]);

    useEffect(() => {
        if (visible) {
            void refreshRoomInfo();
        }
    }, [visible, refreshRoomInfo]);

    useEffect(() => {
        const handleRoomUpdated = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.roomId === roomId) {
                void refreshRoomInfo();
            }
        };

        window.addEventListener('chat_room_updated', handleRoomUpdated);
        return () => window.removeEventListener('chat_room_updated', handleRoomUpdated);
    }, [roomId, refreshRoomInfo]);

    const handleKick = useCallback(async (userId: string) => {
        setActionLoading(userId);
        try {
            await chatApi.kickRoomMember(roomId, userId);
            closeMemberPopup();
            await refreshRoomInfo();
        } catch {
            // ignore
        } finally {
            setActionLoading(null);
        }
    }, [closeMemberPopup, roomId, refreshRoomInfo]);

    const handleAddMember = useCallback(async (userId: string) => {
        setActionLoading(userId);
        try {
            await chatApi.addRoomMember(roomId, userId);
            await refreshRoomInfo();
            closeAddMemberPanel();
        } catch {
            // ignore
        } finally {
            setActionLoading(null);
        }
    }, [closeAddMemberPanel, roomId, refreshRoomInfo]);

    const handleLeave = useCallback(async () => {
        if (!confirm('Are you sure you want to leave this group?')) return;
        try {
            await chatApi.leaveRoom(roomId);
            onLeaveOrDelete?.();
        } catch {
            // ignore
        }
    }, [roomId, onLeaveOrDelete]);

    const handleDeleteChat = useCallback(async () => {
        if (!confirm(getDeleteConfirmMessage(isOwner))) return;
        try {
            await chatApi.deleteRoom(roomId);
            onLeaveOrDelete?.();
        } catch {
            // ignore
        }
    }, [roomId, isOwner, onLeaveOrDelete]);

    const handleSendFriendRequest = useCallback(async (username: string) => {
        setActionLoading(username);
        try {
            await chatApi.sendFriendRequest(username);
            setMemberPopup((previous) => (
                previous ? { ...previous, addFriendSent: true } : previous
            ));
        } catch {
            // ignore
        } finally {
            setActionLoading(null);
        }
    }, []);

    const openMemberPopup = useCallback((member: ChatContact) => {
        setMemberPopup({
            member,
            isFriend: contacts.some((contact) => contact.id === member.id),
            isSelf: isSelfMember(member, currentUserId),
            isRoomOwner: isRoomOwnerMember(member, room?.createdBy),
            addFriendSent: false,
        });
    }, [contacts, currentUserId, room]);

    const openAddMemberPanel = useCallback(() => {
        setShowAddMember(true);
    }, []);

    const handleFriendSearchChange = useCallback((value: string) => {
        setFriendSearch(value);
    }, []);

    if (!visible) return null;

    const isGroup = room?.type === 'group';
    const canManageMembers = isGroup && isOwner;
    const canAddMembers = canManageMembers;
    const canLeaveGroup = isGroup && !isOwner;
    const canDeleteChat = true;
    const availableFriends = filterAvailableFriends(contacts, members, friendSearch);
    const deleteLabel = canManageMembers ? 'Delete Group' : 'Delete Chat';

    return (
        <>
            <div
                className={styles.groupInfoBackdrop}
                onClick={onClose}
            />

            <div className={styles.groupInfoPanel}>
                <GroupInfoHeader isGroup={isGroup} onClose={onClose} />

                {loading ? (
                    <GroupInfoLoading />
                ) : (
                    <div className={styles.groupInfoBody}>
                        <RoomSummarySection
                            roomName={room?.name}
                            isGroup={isGroup}
                            memberCount={members.length}
                            isOwner={isOwner}
                        />

                        <MemberListSection
                            members={members}
                            currentUserId={currentUserId}
                            roomOwnerId={room?.createdBy}
                            canManageMembers={canManageMembers}
                            actionLoading={actionLoading}
                            onAvatarClick={openMemberPopup}
                            onKick={handleKick}
                        />

                        {canAddMembers && (
                            <GroupSettingsSection
                                showAddMember={showAddMember}
                                friendSearch={friendSearch}
                                availableFriends={availableFriends}
                                actionLoading={actionLoading}
                                onShowAddMember={openAddMemberPanel}
                                onFriendSearchChange={handleFriendSearchChange}
                                onAddMember={handleAddMember}
                                onCancel={closeAddMemberPanel}
                            />
                        )}

                        <ActionSection
                            canLeaveGroup={canLeaveGroup}
                            canDeleteChat={canDeleteChat}
                            deleteLabel={deleteLabel}
                            onLeave={handleLeave}
                            onDelete={handleDeleteChat}
                        />
                    </div>
                )}

                <MemberProfilePopup
                    memberPopup={memberPopup}
                    actionLoading={actionLoading}
                    canManageMembers={canManageMembers}
                    onClose={closeMemberPopup}
                    onSendFriendRequest={handleSendFriendRequest}
                    onKick={handleKick}
                />
            </div>
        </>
    );
}
