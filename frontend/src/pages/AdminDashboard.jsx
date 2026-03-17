import React, { useMemo } from 'react';
// 👇 修改：作为模块引入
import styles from '../styles/AdminDashboard.module.css';

export default function AdminDashboard({
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

    const stats = useMemo(() => ({
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        teachers: users.filter(u => u.role === 'teacher').length,
        students: users.filter(u => u.role === 'student').length,
    }), [users]);

    return (
        <div style={{ position: 'relative' }}>
            {/* 使用 styles 对象 */}
            <div className={styles.bgOrb}></div>
            <div className={styles.adminContainer}>

                <div className={styles.statsGrid}>
                    <div className={`${styles.statCard} ${styles.cardTotal}`}>
                        <div className={styles.statInfo}>
                            <h3>Total Users</h3>
                            <div className={styles.count}>{stats.total}</div>
                        </div>
                        <div className={styles.statIcon}><i className="fas fa-users"></i></div>
                    </div>
                    <div className={`${styles.statCard} ${styles.cardAdmin}`}>
                        <div className={styles.statInfo}>
                            <h3>Administrators</h3>
                            <div className={styles.count}>{stats.admins}</div>
                        </div>
                        <div className={styles.statIcon}><i className="fas fa-user-shield"></i></div>
                    </div>
                    <div className={`${styles.statCard} ${styles.cardTeacher}`}>
                        <div className={styles.statInfo}>
                            <h3>Teachers</h3>
                            <div className={styles.count}>{stats.teachers}</div>
                        </div>
                        <div className={styles.statIcon}><i className="fas fa-chalkboard-teacher"></i></div>
                    </div>
                    <div className={`${styles.statCard} ${styles.cardStudent}`}>
                        <div className={styles.statInfo}>
                            <h3>Students</h3>
                            <div className={styles.count}>{stats.students}</div>
                        </div>
                        <div className={styles.statIcon}><i className="fas fa-user-graduate"></i></div>
                    </div>
                </div>

                <div className={styles.dashboardCard}>
                    <div className={styles.dashboardHeader}>
                        <div className={styles.headerLeft}>
                            <div className={styles.headerTitle}>
                                <h2>User Management</h2>
                                <p>Manage access permissions and system users</p>
                            </div>
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
                                    const roleStyle = {
                                        admin: { bg: '#e6f7ff', color: '#007aff' },
                                        teacher: { bg: '#eef2ff', color: '#4f46e5' },
                                        student: { bg: '#f0fdf4', color: '#00ab55' }
                                    }[user.role] || { bg: '#f0fdf4', color: '#00ab55' };

                                    return (
                                        <tr key={user.id} id={`row-${user.id}`} style={{ transition: 'all 0.3s ease' }}>
                                            <td>
                                                <span style={{ color: '#bbb', fontFamily: "'Courier New', monospace", fontWeight: 600 }}>
                                                    #{user.id.substring(0, 6)}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.userCell}>
                                                    <div className={styles.avatarCircle} style={{ backgroundColor: roleStyle.bg, color: roleStyle.color }}>
                                                        {user.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#333' }}>
                                                        {user.username}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ color: '#666' }}>{user.email}</td>
                                            <td>
                                                {user.role === 'admin' && <span className={`${styles.badge} ${styles.badgeAdmin}`}><i className="fas fa-shield-alt"></i> Admin</span>}
                                                {user.role === 'teacher' && <span className={`${styles.badge} ${styles.badgeTeacher}`}><i className="fas fa-chalkboard-teacher"></i> Teacher</span>}
                                                {user.role === 'student' && <span className={`${styles.badge} ${styles.badgeStudent}`}><i className="fas fa-user-graduate"></i> Student</span>}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div className={styles.actionCell}>
                                                    {!isCurrentUser ? (
                                                        <>
                                                            <button className={`${styles.btnAction} ${styles.btnEdit}`} onClick={() => openEditModal(user)} title="Edit" style={{ marginRight: '8px' }}>
                                                                <i className="fas fa-pen" style={{ fontSize: '0.8rem' }}></i>
                                                            </button>
                                                            <button className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => deleteUser(user.id, user.username)} title="Delete" disabled={deletingId === user.id}>
                                                                {deletingId === user.id ?
                                                                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '0.8rem' }}></i> :
                                                                    <i className="fas fa-trash-alt" style={{ fontSize: '0.8rem' }}></i>
                                                                }
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

                        {filteredUsers.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aaa' }}>
                                <i className="fas fa-search" style={{ fontSize: '2.5rem', marginBottom: '15px', opacity: 0.3 }}></i>
                                <p>No users found matching your search.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 模态框 */}
            <div className={`${styles.modalOverlay} ${modalState.isOpen ? styles.modalOverlayActive : ''}`} onClick={(e) => { if(e.target === e.currentTarget) closeModal(); }}>
                <div className={styles.modalContent}>
                    <div className={styles.modalHeader}>
                        <h3>{modalState.isEditMode ? "Edit User Profile" : "Add New User"}</h3>
                        <button type="button" className={styles.closeBtn} onClick={closeModal}>&times;</button>
                    </div>
                    <form onSubmit={handleFormSubmit}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Username</label>
                            <input type="text" className={styles.formInput} required placeholder="e.g. John Doe" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Email Address</label>
                            <input type="email" className={styles.formInput} required placeholder="e.g. john@hku.hk" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Password</label>
                            <input type="password" className={styles.formInput} required={!modalState.isEditMode} placeholder={modalState.isEditMode ? "Leave empty to keep current" : "Enter initial password"} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            <small className={styles.formNote}>
                                {modalState.isEditMode ? "Only fill this if you want to reset the password." : "Required for new users."}
                            </small>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Role Permission</label>
                            <div className={styles.formSelectWrapper}>
                                <select className={styles.formSelect} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                                    <option value="student">Student (Standard Access)</option>
                                    <option value="teacher">Teacher (Instructor Access)</option>
                                    <option value="admin">Administrator (Full Access)</option>
                                </select>
                            </div>
                            <small className={styles.formNote}>Assign appropriate permission levels to the user.</small>
                        </div>

                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancel</button>
                            <button type="submit" className={styles.btnSave} disabled={isSaving}>
                                {isSaving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}