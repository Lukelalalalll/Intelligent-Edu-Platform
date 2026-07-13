import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    fileCenterApi,
    type AIFileGroup,
    type AIUserSummary,
    type ChatRoomAssetSummary,
    type FileAsset,
} from './api/fileCenterApi';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import BaseModal from '../../shared/BaseModal';
import '../../styles/base.css';
import styles from './styles/AdminFileCenter.module.css';
import EntryCards from './components/EntryCards';
import RoleCards from './components/RoleCards';
import GroupChatRoomsTable from './components/GroupChatRoomsTable';
import GroupAssetsTable from './components/GroupAssetsTable';
import RoleUsersTable from './components/RoleUsersTable';
import UserGroupsSection from './components/UserGroupsSection';
import type { ToolSummary, HistoryItem, AdminUser } from '../file-center/api/fileCenterHistoryApi';
import { fileCenterHistoryApi } from '../file-center/api/fileCenterHistoryApi';
import ToolSummaryCards from '../file-center/components/ToolSummaryCards';
import ToolHistoryTab from '../file-center/components/ToolHistoryTab';
import HistoryDetailModal from '../file-center/components/HistoryDetailModal';
import ToolHistoryUsersTable from './components/ToolHistoryUsersTable';

type RootMode = 'entry' | 'group' | 'personal' | 'toolHistory';
type RoleMode = 'teacher' | 'student';

export default function AdminFileCenterPage() {
    const isEntranceActive = usePageEntrance();
    const [rootMode, setRootMode] = useState<RootMode>('entry');

    const [chatRooms, setChatRooms] = useState<ChatRoomAssetSummary[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<ChatRoomAssetSummary | null>(null);
    const [roomAssets, setRoomAssets] = useState<FileAsset[]>([]);

    const [selectedRole, setSelectedRole] = useState<RoleMode | null>(null);
    const [roleUsers, setRoleUsers] = useState<AIUserSummary[]>([]);
    const [selectedUser, setSelectedUser] = useState<AIUserSummary | null>(null);
    const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
    const [userGroups, setUserGroups] = useState<AIFileGroup[]>([]);

    // ── Tool History state ──
    const [toolHistoryUsers, setToolHistoryUsers] = useState<AdminUser[]>([]);
    const [toolHistoryUsersLoading, setToolHistoryUsersLoading] = useState(false);
    const [toolHistorySelectedUser, setToolHistorySelectedUser] = useState<AdminUser | null>(null);
    const [toolSummary, setToolSummary] = useState<ToolSummary[]>([]);
    const [activeTool, setActiveTool] = useState('');
    const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        asset: FileAsset | null;
        action: 'soft' | 'restore' | 'hard' | null;
    }>({ show: false, asset: null, action: null });

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

    const loadToolHistoryUsers = useCallback(async () => {
        setToolHistoryUsersLoading(true);
        try {
            const users = await fileCenterHistoryApi.adminGetUsers();
            setToolHistoryUsers(users);
        } catch {
            // silent
        } finally {
            setToolHistoryUsersLoading(false);
        }
    }, []);

    const loadToolSummaryForUser = useCallback(async (user: AdminUser) => {
        try {
            const data = await fileCenterHistoryApi.adminGetSummary(user.id);
            setToolSummary(data);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        if (rootMode === 'toolHistory') { void loadToolHistoryUsers(); }
    }, [rootMode, loadToolHistoryUsers]);

    const runAction = useCallback(async (asset: FileAsset, action: 'soft' | 'restore' | 'hard') => {
        setConfirmModal({ show: true, asset, action });
    }, []);

    const executeAction = useCallback(async () => {
        const { asset, action } = confirmModal;
        if (!asset || !action) return;

        setConfirmModal({ show: false, asset: null, action: null });
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
    }, [confirmModal, rootMode, selectedRoom, selectedUser, groupBy, loadRoomAssets, loadUserAssets]);

    useEffect(() => {
        if (rootMode === 'group') {
            void loadChatRooms();
        }
    }, [rootMode, loadChatRooms]);

    const breadcrumb = useMemo(() => {
        const parts = ['File Center'];
        if (rootMode === 'entry') return parts;
        if (rootMode === 'group') {
            parts.push('Group Files');
            if (selectedRoom) {
                parts.push(selectedRoom.name || selectedRoom.room_id);
            }
            return parts;
        }
        if (rootMode === 'toolHistory') {
            parts.push('Tool History');
            if (toolHistorySelectedUser) {
                parts.push(toolHistorySelectedUser.username || toolHistorySelectedUser.id);
                if (activeTool) {
                    parts.push(activeTool);
                }
            }
            return parts;
        }
        parts.push('Personal Files');
        if (selectedRole) {
            parts.push(selectedRole);
            if (selectedUser) {
                parts.push(selectedUser.username || selectedUser.user_id);
            }
        }
        return parts;
    }, [rootMode, selectedRole, selectedRoom, selectedUser, toolHistorySelectedUser, activeTool]);

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

        if (rootMode === 'toolHistory') {
            if (activeTool) {
                setActiveTool('');
                return;
            }
            if (toolHistorySelectedUser) {
                setToolHistorySelectedUser(null);
                setToolSummary([]);
                return;
            }
            setRootMode('entry');
            setToolHistoryUsers([]);
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
        if (rootMode === 'toolHistory') {
            if (toolHistorySelectedUser) {
                void loadToolSummaryForUser(toolHistorySelectedUser);
            } else {
                void loadToolHistoryUsers();
            }
        }
    };

    return (
        <div className={`${styles.page} ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                title={<><i className="fa-solid fa-server" aria-hidden="true"></i> Admin File Center</>}
                subtitle="Oversee, manage, and audit all digital assets across the platform. Control group files and AI chat attachments within a centralized, secure environment."
                as="header"
                variant="workspace"
            />

            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    {rootMode !== 'entry' && (
                        <button className={styles.btn} type="button" onClick={backAction}>
                            <i className="fa-solid fa-arrow-left"></i> Back
                        </button>
                    )}
                    <div className={styles.pathText}>
                        {breadcrumb.map((part, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <i className="fa-solid fa-chevron-right" style={{ fontSize: '10px', color: '#cbd5e1' }}></i>}
                                <span className={i === breadcrumb.length - 1 ? styles.pathCurrent : styles.pathLink}>
                                    {part.charAt(0).toUpperCase() + part.slice(1)}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={refreshCurrent}>
                    <i className="fa-solid fa-rotate-right"></i> Refresh
                </button>
            </div>

            {error && <div className={styles.empty}>{error}</div>}

            {rootMode === 'entry' && (
                <EntryCards
                    onOpenGroup={() => setRootMode('group')}
                    onOpenPersonal={() => setRootMode('personal')}
                    onOpenToolHistory={() => setRootMode('toolHistory')}
                />
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

            {rootMode === 'toolHistory' && !toolHistorySelectedUser && (
                <ToolHistoryUsersTable
                    busy={toolHistoryUsersLoading}
                    users={toolHistoryUsers}
                    onOpenUser={(u) => { setToolHistorySelectedUser(u); void loadToolSummaryForUser(u); }}
                />
            )}

            {rootMode === 'toolHistory' && !!toolHistorySelectedUser && !activeTool && (
                <ToolSummaryCards tools={toolSummary} activeTool={activeTool} onSelect={setActiveTool} />
            )}

            {rootMode === 'toolHistory' && !!toolHistorySelectedUser && !!activeTool && (
                <>
                    <ToolHistoryTab
                        key={`${activeTool}-${toolHistorySelectedUser.id}`}
                        tool={activeTool}
                        adminUserId={toolHistorySelectedUser.id}
                        onDeleted={() => void loadToolSummaryForUser(toolHistorySelectedUser)}
                    />
                    {detailItem && (
                        <HistoryDetailModal
                            item={detailItem}
                            tool={activeTool}
                            onClose={() => setDetailItem(null)}
                        />
                    )}
                </>
            )}

            <BaseModal open={confirmModal.show} onClose={() => setConfirmModal({ ...confirmModal, show: false })}>
                {confirmModal.action === 'restore' ? (
                    <>
                        <div className={styles.modalIcon} style={{ background: 'rgba(0, 123, 85, 0.1)', color: '#007b55' }}>
                            <i className="fas fa-undo"></i>
                        </div>
                        <h3 className={styles.modalTitle}>Restore File?</h3>
                        <p className={styles.modalDesc}>
                            Are you sure you want to restore file <br />
                            <strong>{confirmModal.asset?.filename || confirmModal.asset?.file_id}</strong>?
                        </p>
                        <div className={styles.modalActions}>
                            <button className={`${styles.modalBtn} ${styles.cancelBtn}`} onClick={() => setConfirmModal({ ...confirmModal, show: false })}>Cancel</button>
                            <button className={`${styles.modalBtn} ${styles.confirmBtn}`} style={{ background: '#007b55', boxShadow: 'none' }} onClick={executeAction}>Restore</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={styles.modalIcon}>
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 className={styles.modalTitle}>
                            {confirmModal.action === 'hard' ? 'Hard Delete File?' : 'Delete File?'}
                        </h3>
                        <p className={styles.modalDesc}>
                            You are about to {confirmModal.action === 'hard' ? <strong>permanently delete</strong> : 'delete'} <br />
                            <strong>{confirmModal.asset?.filename || confirmModal.asset?.file_id}</strong>.
                            {confirmModal.action === 'hard' && <><br />This action cannot be undone.</>}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={`${styles.modalBtn} ${styles.cancelBtn}`} onClick={() => setConfirmModal({ ...confirmModal, show: false })}>Cancel</button>
                            <button className={`${styles.modalBtn} ${styles.confirmBtn}`} onClick={executeAction}>Delete</button>
                        </div>
                    </>
                )}
            </BaseModal>
        </div>
    );
}
