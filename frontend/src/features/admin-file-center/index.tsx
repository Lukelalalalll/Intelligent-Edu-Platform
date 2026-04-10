import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    fileCenterApi,
    type AIFileGroup,
    type AIUserSummary,
    type ChatRoomAssetSummary,
    type FileAsset,
} from '../../api/fileCenterApi';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import '../../styles/base.css';
import styles from './styles/AdminFileCenter.module.css';
import EntryCards from './components/EntryCards';
import RoleCards from './components/RoleCards';
import GroupChatRoomsTable from './components/GroupChatRoomsTable';
import GroupAssetsTable from './components/GroupAssetsTable';
import RoleUsersTable from './components/RoleUsersTable';
import UserGroupsSection from './components/UserGroupsSection';

type RootMode = 'entry' | 'group' | 'personal';
type RoleMode = 'teacher' | 'student';

export default function AdminFileCenterPage() {
    const [rootMode, setRootMode] = useState<RootMode>('entry');

    const [chatRooms, setChatRooms] = useState<ChatRoomAssetSummary[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<ChatRoomAssetSummary | null>(null);
    const [roomAssets, setRoomAssets] = useState<FileAsset[]>([]);

    const [selectedRole, setSelectedRole] = useState<RoleMode | null>(null);
    const [roleUsers, setRoleUsers] = useState<AIUserSummary[]>([]);
    const [selectedUser, setSelectedUser] = useState<AIUserSummary | null>(null);
    const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
    const [userGroups, setUserGroups] = useState<AIFileGroup[]>([]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const loadChatRooms = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
            const data = await fileCenterApi.listChatRooms();
            setChatRooms(data.rooms || []);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to load group chats');
        } finally {
            setBusy(false);
        }
    }, []);

    const loadRoomAssets = useCallback(async (room: ChatRoomAssetSummary) => {
        setBusy(true);
        setError('');
        try {
            const data = await fileCenterApi.listChatRoomAssets(room.room_id);
            setSelectedRoom(room);
            setRoomAssets(data.assets || []);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to load room files');
        } finally {
            setBusy(false);
        }
    }, []);

    const loadRoleUsers = useCallback(async (role: RoleMode) => {
        setBusy(true);
        setError('');
        try {
            const data = await fileCenterApi.listAIUsers(role);
            setSelectedRole(role);
            setRoleUsers(data.users || []);
            setSelectedUser(null);
            setUserGroups([]);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to load users');
        } finally {
            setBusy(false);
        }
    }, []);

    const loadUserAssets = useCallback(async (user: AIUserSummary, dateGrouping: 'day' | 'month' = groupBy) => {
        setBusy(true);
        setError('');
        try {
            const data = await fileCenterApi.listAIUserAssets(user.user_id, dateGrouping);
            setSelectedUser(user);
            setUserGroups(data.groups || []);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to load user AI files');
        } finally {
            setBusy(false);
        }
    }, [groupBy]);

    const runAction = useCallback(async (asset: FileAsset, action: 'soft' | 'restore' | 'hard') => {
        const label = action === 'hard' ? 'Hard Delete' : action === 'soft' ? 'Soft Delete' : 'Restore';
        const ok = window.confirm(`${label} file ${asset.filename || asset.file_id}?`);
        if (!ok) return;

        setBusy(true);
        setError('');
        try {
            if (action === 'soft') {
                await fileCenterApi.softDelete(asset.file_id, 'Admin file center action');
            } else if (action === 'restore') {
                await fileCenterApi.restore(asset.file_id);
            } else {
                await fileCenterApi.hardDelete(asset.file_id);
            }

            if (rootMode === 'group' && selectedRoom) {
                await loadRoomAssets(selectedRoom);
            }
            if (rootMode === 'personal' && selectedUser) {
                await loadUserAssets(selectedUser, groupBy);
            }
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Action failed');
        } finally {
            setBusy(false);
        }
    }, [groupBy, loadRoomAssets, loadUserAssets, rootMode, selectedRoom, selectedUser]);

    useEffect(() => {
        if (rootMode === 'group') {
            void loadChatRooms();
        }
    }, [rootMode, loadChatRooms]);

    const breadcrumb = useMemo(() => {
        if (rootMode === 'entry') return 'File Center';
        if (rootMode === 'group') {
            return selectedRoom ? `File Center / Group Files / ${selectedRoom.name || selectedRoom.room_id}` : 'File Center / Group Files';
        }
        if (!selectedRole) return 'File Center / Personal Files';
        if (!selectedUser) return `File Center / Personal Files / ${selectedRole}`;
        return `File Center / Personal Files / ${selectedRole} / ${selectedUser.username}`;
    }, [rootMode, selectedRole, selectedRoom, selectedUser]);

    const backAction = () => {
        if (rootMode === 'entry') return;
        if (rootMode === 'group') {
            if (selectedRoom) {
                setSelectedRoom(null);
                setRoomAssets([]);
                return;
            }
            setRootMode('entry');
            return;
        }

        if (selectedUser) {
            setSelectedUser(null);
            setUserGroups([]);
            return;
        }
        if (selectedRole) {
            setSelectedRole(null);
            setRoleUsers([]);
            return;
        }
        setRootMode('entry');
    };

    const refreshCurrent = () => {
        if (rootMode === 'group' && selectedRoom) {
            void loadRoomAssets(selectedRoom);
            return;
        }
        if (rootMode === 'group') {
            void loadChatRooms();
            return;
        }
        if (rootMode === 'personal' && selectedUser) {
            void loadUserAssets(selectedUser, groupBy);
            return;
        }
        if (rootMode === 'personal' && selectedRole) {
            void loadRoleUsers(selectedRole);
        }
    };

    return (
        <div className={styles.page}>
            <WelcomeBanner
                title={<><i className="fa-solid fa-server" aria-hidden="true"></i> Admin File Center</>}
                subtitle="Oversee, manage, and audit all digital assets across the platform. Control group files and AI chat attachments within a centralized, secure environment."
                as="header"
            />

            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    {rootMode !== 'entry' && (
                        <button className={styles.btn} type="button" onClick={backAction}>
                            <i className="fa-solid fa-arrow-left"></i> Back
                        </button>
                    )}
                    <span className={styles.pathText}>{breadcrumb}</span>
                </div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={refreshCurrent}>
                    <i className="fa-solid fa-rotate-right"></i> Refresh
                </button>
            </div>

            {error && <div className={styles.empty}>{error}</div>}

            {rootMode === 'entry' && (
                <EntryCards onOpenGroup={() => setRootMode('group')} onOpenPersonal={() => setRootMode('personal')} />
            )}

            {rootMode === 'group' && !selectedRoom && (
                <GroupChatRoomsTable busy={busy} chatRooms={chatRooms} onOpenRoom={(room) => void loadRoomAssets(room)} />
            )}

            {rootMode === 'group' && !!selectedRoom && (
                <GroupAssetsTable busy={busy} roomAssets={roomAssets} runAction={runAction} />
            )}

            {rootMode === 'personal' && !selectedRole && (
                <RoleCards onTeacher={() => void loadRoleUsers('teacher')} onStudent={() => void loadRoleUsers('student')} />
            )}

            {rootMode === 'personal' && !!selectedRole && !selectedUser && (
                <RoleUsersTable busy={busy} roleUsers={roleUsers} onOpenUser={(u) => void loadUserAssets(u)} />
            )}

            {rootMode === 'personal' && !!selectedUser && (
                <UserGroupsSection
                    busy={busy}
                    groupBy={groupBy}
                    onGroupByChange={(value) => {
                        setGroupBy(value);
                        void loadUserAssets(selectedUser, value);
                    }}
                    userGroups={userGroups}
                    runAction={runAction}
                />
            )}
        </div>
    );
}
