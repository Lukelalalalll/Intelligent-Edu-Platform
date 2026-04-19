import React, { useEffect, useState } from 'react';
import type { AdminUser } from '../api/fileCenterHistoryApi';
import { fileCenterHistoryApi } from '../api/fileCenterHistoryApi';
import styles from '../styles/fileCenter.module.css';

interface Props {
    selectedUserId: string;
    onSelect: (userId: string) => void;
}

export default function AdminUserSelector({ selectedUserId, onSelect }: Props) {
    const [users, setUsers] = useState<AdminUser[]>([]);

    useEffect(() => {
        fileCenterHistoryApi.adminGetUsers().then(setUsers).catch(() => {});
    }, []);

    return (
        <div className={styles.adminBar}>
            <span className={styles.adminBarLabel}>
                <i className="fas fa-shield-alt" /> Admin: Viewing user
            </span>
            <select
                className={styles.userSelect}
                value={selectedUserId}
                onChange={e => onSelect(e.target.value)}
            >
                <option value="">All Users</option>
                {users.map(u => (
                    <option key={u.id} value={u.id}>
                        {u.username} ({u.role}) — {u.email || u.id}
                    </option>
                ))}
            </select>
        </div>
    );
}
