import React from 'react';
import type { AdminUser } from '../../file-center/api/fileCenterHistoryApi';
import styles from '../styles/AdminFileCenter.module.css';

type Props = {
    busy: boolean;
    users: AdminUser[];
    onOpenUser: (user: AdminUser) => void;
};

export default function ToolHistoryUsersTable({ busy, users, onOpenUser }: Props) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {busy ? (
                        <tr><td colSpan={4}>Loading users…</td></tr>
                    ) : users.length === 0 ? (
                        <tr><td colSpan={4}>No users with tool history records found.</td></tr>
                    ) : users.map((u) => (
                        <tr key={u.id}>
                            <td><strong>{u.username}</strong></td>
                            <td>{u.email}</td>
                            <td>{u.role}</td>
                            <td>
                                <button
                                    className={`${styles.btn} ${styles.btnSmall}`}
                                    type="button"
                                    onClick={() => onOpenUser(u)}
                                >
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
