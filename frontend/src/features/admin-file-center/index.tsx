import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    fileCenterApi,
    type AIFileGroup,
    type AIUserSummary,
    type ChatRoomAssetSummary,
    type FileAsset,
} from '../../api/fileCenterApi';
import '../../styles/base.css';
import styles from './styles/AdminFileCenter.module.css';

type RootMode = 'entry' | 'group' | 'personal';
type RoleMode = 'teacher' | 'student';

function formatBytes(num: number): string {
    const n = Number(num || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusClass(status: string): string {
    if (status === 'soft_deleted') return styles.statusSoft;
    if (status === 'hard_deleted') return styles.statusHard;
    return styles.statusActive;
}

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

    return (
        <div className={styles.page}>
            <header className="page-header">
                <h1><i className="fa-solid fa-server" aria-hidden="true"></i> Admin File Center</h1>
                <p>
                    Oversee, manage, and audit all digital assets across the platform. Control group files and AI chat attachments within a centralized, secure environment.
                </p>
            </header>

            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    {rootMode !== 'entry' && (
                        <button className={styles.btn} type="button" onClick={backAction}>
                            <i className="fa-solid fa-arrow-left"></i> Back
                        </button>
                    )}
                    <span className={styles.pathText}>{breadcrumb}</span>
                </div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => {
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
                }}>
                    <i className="fa-solid fa-rotate-right"></i> Refresh
                </button>
            </div>

            {error && <div className={styles.empty}>{error}</div>}

            {rootMode === 'entry' && (
                <div className={styles.cardGrid}>
                    <button className={styles.entryCard} type="button" onClick={() => setRootMode('group')}>
                        <div className={styles.cardIconWrap}>
                            <i className="fa-solid fa-comments"></i>
                        </div>
                        <h3 className={styles.entryTitle}>Group Chat Files</h3>
                        <p className={styles.entryText}>View and manage all group chat attachments. Monitor files and execute soft or hard deletions.</p>
                    </button>
                    <button className={styles.entryCard} type="button" onClick={() => setRootMode('personal')}>
                        <div className={styles.cardIconWrap}>
                            <i className="fa-solid fa-robot"></i>
                        </div>
                        <h3 className={styles.entryTitle}>Personal AI Files</h3>
                        <p className={styles.entryText}>Select a role and user to browse AI-generated assets grouped by session dates.</p>
                    </button>
                </div>
            )}

            {rootMode === 'group' && !selectedRoom && (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Group Name</th>
                                <th>Members</th>
                                <th>Course</th>
                                <th>Files</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {busy ? (
                                <tr><td colSpan={5}>Loading...</td></tr>
                            ) : chatRooms.length === 0 ? (
                                <tr><td colSpan={5}>No group chat rooms found.</td></tr>
                            ) : chatRooms.map((room) => (
                                <tr key={room.room_id}>
                                    <td>{room.name || room.room_id}</td>
                                    <td>{room.member_count}</td>
                                    <td>{room.course_id || '-'}</td>
                                    <td>{room.asset_count}</td>
                                    <td>
                                        <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void loadRoomAssets(room)}>
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {rootMode === 'group' && !!selectedRoom && (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Created</th>
                                <th>Size</th>
                                <th>Path</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {busy ? (
                                <tr><td colSpan={7}>Loading...</td></tr>
                            ) : roomAssets.length === 0 ? (
                                <tr><td colSpan={7}>No files in this group chat.</td></tr>
                            ) : roomAssets.map((asset) => (
                                <tr key={asset.file_id}>
                                    <td className={statusClass(asset.status)}>{asset.status}</td>
                                    <td>{asset.filename || asset.file_id}</td>
                                    <td>{asset.file_type}</td>
                                    <td>{String(asset.created_at || '').replace('T', ' ').slice(0, 19)}</td>
                                    <td>{formatBytes(asset.size)}</td>
                                    <td>{asset.storage_path}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            {asset.status === 'active' && (
                                                <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'soft')}>
                                                    Soft Delete
                                                </button>
                                            )}
                                            {asset.status === 'soft_deleted' && (
                                                <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'restore')}>
                                                    Restore
                                                </button>
                                            )}
                                            {asset.status !== 'hard_deleted' && (
                                                <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'hard')}>
                                                    Hard Delete
                                                </button>
                                            )}
                                            {asset.status !== 'hard_deleted' && (
                                                <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => window.open(`/api/admin/files/assets/${encodeURIComponent(asset.file_id)}/download`, '_blank')}>
                                                    Download
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {rootMode === 'personal' && !selectedRole && (
                <div className={styles.cardGrid}>
                    <button className={styles.entryCard} type="button" onClick={() => void loadRoleUsers('teacher')}>
                        <div className={styles.cardIconWrap}>
                            <i className="fa-solid fa-chalkboard-user"></i>
                        </div>
                        <h3 className={styles.entryTitle}>Teacher Assets</h3>
                        <p className={styles.entryText}>Audit and manage files generated during teacher-AI sessions.</p>
                    </button>
                    <button className={styles.entryCard} type="button" onClick={() => void loadRoleUsers('student')}>
                        <div className={styles.cardIconWrap}>
                            <i className="fa-solid fa-user-graduate"></i>
                        </div>
                        <h3 className={styles.entryTitle}>Student Assets</h3>
                        <p className={styles.entryText}>Audit and manage files generated during student-AI sessions.</p>
                    </button>
                </div>
            )}

            {rootMode === 'personal' && !!selectedRole && !selectedUser && (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Sessions</th>
                                <th>Files</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {busy ? (
                                <tr><td colSpan={6}>Loading...</td></tr>
                            ) : roleUsers.length === 0 ? (
                                <tr><td colSpan={6}>No users found for this role.</td></tr>
                            ) : roleUsers.map((u) => (
                                <tr key={u.user_id}>
                                    <td>{u.username}</td>
                                    <td>{u.email}</td>
                                    <td>{u.role}</td>
                                    <td>{u.session_count}</td>
                                    <td>{u.asset_count}</td>
                                    <td>
                                        <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void loadUserAssets(u)}>
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {rootMode === 'personal' && !!selectedUser && (
                <div>
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarLeft}>
                            <span className={styles.pathText}>Date Grouping</span>
                            <button
                                type="button"
                                className={`${styles.btn} ${groupBy === 'day' ? styles.btnPrimary : ''}`}
                                onClick={() => {
                                    setGroupBy('day');
                                    void loadUserAssets(selectedUser, 'day');
                                }}
                            >
                                Day
                            </button>
                            <button
                                type="button"
                                className={`${styles.btn} ${groupBy === 'month' ? styles.btnPrimary : ''}`}
                                onClick={() => {
                                    setGroupBy('month');
                                    void loadUserAssets(selectedUser, 'month');
                                }}
                            >
                                Month
                            </button>
                        </div>
                    </div>

                    {busy && <div className={styles.empty}>Loading...</div>}
                    {!busy && userGroups.length === 0 && <div className={styles.empty}>No AI chat files found for this user.</div>}

                    {!busy && userGroups.map((group) => (
                        <div key={group.date} className={styles.dateGroup}>
                            <div className={styles.dateHeader}>
                                <strong>{group.date}</strong>
                                <span className={styles.muted}>{group.count} files • {formatBytes(group.total_size)}</span>
                            </div>
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Status</th>
                                            <th>Name</th>
                                            <th>Session</th>
                                            <th>Type</th>
                                            <th>Size</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map((asset) => (
                                            <tr key={asset.file_id}>
                                                <td className={statusClass(asset.status)}>{asset.status}</td>
                                                <td>{asset.filename || asset.file_id}</td>
                                                <td>{asset.session_id || '-'}</td>
                                                <td>{asset.file_type}</td>
                                                <td>{formatBytes(asset.size)}</td>
                                                <td>
                                                    <div className={styles.actions}>
                                                        {asset.status === 'active' && (
                                                            <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'soft')}>
                                                                Soft Delete
                                                            </button>
                                                        )}
                                                        {asset.status === 'soft_deleted' && (
                                                            <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'restore')}>
                                                                Restore
                                                            </button>
                                                        )}
                                                        {asset.status !== 'hard_deleted' && (
                                                            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`} type="button" onClick={() => void runAction(asset, 'hard')}>
                                                                Hard Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
