import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import styles from '../../../styles/AdminDashboard.module.css';

export default function UserManagementPanel({
    users, currentUserId, searchQuery, setSearchQuery,
    modalState, formData, setFormData, isSaving, deletingId,
    openAddModal, openEditModal, closeModal, handleFormSubmit, deleteUser
}) {
    const filteredUsers = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return users.filter(u =>
            u.username.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
        );
    }, [users, searchQuery]);

    return (
        <>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <h2>User Management</h2>
                    <p>Manage access permissions and system users</p>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.searchWrapper}>
                        <i className={`fas fa-search ${styles.searchIcon}`}></i>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search by name/email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button className={styles.btnAdd} onClick={openAddModal}>
                        <i className="fas fa-plus"></i> Add User
                    </button>
                </div>
            </div>

            <div className={styles.tableResponsive}>
                <table className={styles.customTable}>
                    <thead>
                        <tr>
                            <th width="8%">ID</th>
                            <th width="25%">User Profile</th>
                            <th width="30%">Email Address</th>
                            <th width="15%">Role</th>
                            <th width="22%" style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => {
                            const isCurrentUser = user.id === currentUserId;
                            return (
                                <tr key={user.id}>
                                    <td>#{user.id.substring(0, 6)}</td>
                                    <td>
                                        <div className={styles.userCell}>
                                            <div className={styles.avatarCircle}>{user.username.charAt(0).toUpperCase()}</div>
                                            <span>{user.username}</span>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`${styles.badge} ${user.role === 'admin' ? styles.badgeAdmin : user.role === 'teacher' ? styles.badgeTeacher : styles.badgeStudent}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div className={styles.actionCell}>
                                            {!isCurrentUser ? (
                                                <>
                                                    <button className={`${styles.btnAction} ${styles.btnEdit}`} onClick={() => openEditModal(user)} title="Edit">
                                                        <i className="fas fa-pen"></i>
                                                    </button>
                                                    <button className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => deleteUser(user.id, user.username)} title="Delete" disabled={deletingId === user.id}>
                                                        {deletingId === user.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-alt"></i>}
                                                    </button>
                                                </>
                                            ) : (
                                                <span className={styles.selfTag}>You</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 用户编辑/新增的弹窗 */}
            {modalState.isOpen && createPortal(
                <div className={`${styles.modalOverlay} ${styles.modalOverlayActive}`} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h3>{modalState.isEditMode ? 'Edit User Profile' : 'Add New User'}</h3>
                            <button type="button" className={styles.closeBtn} onClick={closeModal}>&times;</button>
                        </div>
                        <form onSubmit={handleFormSubmit}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Username</label>
                                <input type="text" className={styles.formInput} required value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Email Address</label>
                                <input type="email" className={styles.formInput} required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Password</label>
                                <input type="password" className={styles.formInput} required={!modalState.isEditMode} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Role Permission</label>
                                <div className={styles.formSelectWrapper}>
                                    <select className={styles.formSelect} value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                        <option value="student">Student</option>
                                        <option value="teacher">Teacher</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancel</button>
                                <button type="submit" className={styles.btnSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
                            </div>
                        </form>
                    </div>
                </div>, 
                document.body
            )}
        </>
    );
}