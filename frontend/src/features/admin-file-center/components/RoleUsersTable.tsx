import React from 'react';
import type { AIUserSummary } from '../../../api/fileCenterApi';
import styles from '../styles/AdminFileCenter.module.css';

type Props = {
    busy: boolean;
    roleUsers: AIUserSummary[];
    onOpenUser: (user: AIUserSummary) => void;
};

export default function RoleUsersTable({ busy, roleUsers, onOpenUser }: Props) {
    return (
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
                                <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => onOpenUser(u)}>
                                    Open
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
