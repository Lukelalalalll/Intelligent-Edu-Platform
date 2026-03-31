// import React, { useMemo, useState } from 'react';
// import { createPortal } from 'react-dom';
// import styles from '../styles/AdminDashboard.module.css';

// function ModeSidebar({ activeMode, setActiveMode }) {
//     return (
//         <aside className={styles.modeSidebar}>
//             <button
//                 className={`${styles.modeBtn} ${activeMode === 'users' ? styles.modeBtnActive : ''}`}
//                 onClick={() => setActiveMode('users')}
//             >
//                 <i className="fas fa-users-cog"></i>
//                 Manage User Info
//             </button>
//             <button
//                 className={`${styles.modeBtn} ${activeMode === 'relations' ? styles.modeBtnActive : ''}`}
//                 onClick={() => setActiveMode('relations')}
//             >
//                 <i className="fas fa-project-diagram"></i>
//                 Manage Course Relations
//             </button>
//         </aside>
//     );
// }

// function UserManagementPanel({
//     users,
//     currentUserId,
//     searchQuery,
//     setSearchQuery,
//     modalState,
//     formData,
//     setFormData,
//     isSaving,
//     deletingId,
//     openAddModal,
//     openEditModal,
//     closeModal,
//     handleFormSubmit,
//     deleteUser,
// }) {
//     const filteredUsers = useMemo(() => {
//         const query = searchQuery.toLowerCase();
//         return users.filter(u =>
//             u.username.toLowerCase().includes(query) ||
//             u.email.toLowerCase().includes(query)
//         );
//     }, [users, searchQuery]);

//     return (
//         <>
//             <div className={styles.dashboardHeader}>
//                 <div className={styles.headerTitle}>
//                     <h2>User Management</h2>
//                     <p>Manage access permissions and system users</p>
//                 </div>
//                 <div className={styles.headerActions}>
//                     <div className={styles.searchWrapper}>
//                         <i className={`fas fa-search ${styles.searchIcon}`}></i>
//                         <input
//                             type="text"
//                             className={styles.searchInput}
//                             placeholder="Search by name/email..."
//                             value={searchQuery}
//                             onChange={(e) => setSearchQuery(e.target.value)}
//                         />
//                     </div>
//                     <button className={styles.btnAdd} onClick={openAddModal}>
//                         <i className="fas fa-plus"></i> Add User
//                     </button>
//                 </div>
//             </div>

//             <div className={styles.tableResponsive}>
//                 <table className={styles.customTable}>
//                     <thead>
//                         <tr>
//                             <th width="8%">ID</th>
//                             <th width="25%">User Profile</th>
//                             <th width="30%">Email Address</th>
//                             <th width="15%">Role</th>
//                             <th width="22%" style={{ textAlign: 'center' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filteredUsers.map(user => {
//                             const isCurrentUser = user.id === currentUserId;
//                             return (
//                                 <tr key={user.id}>
//                                     <td>#{user.id.substring(0, 6)}</td>
//                                     <td>
//                                         <div className={styles.userCell}>
//                                             <div className={styles.avatarCircle}>{user.username.charAt(0).toUpperCase()}</div>
//                                             <span>{user.username}</span>
//                                         </div>
//                                     </td>
//                                     <td>{user.email}</td>
//                                     <td>
//                                         <span className={`${styles.badge} ${user.role === 'admin' ? styles.badgeAdmin : user.role === 'teacher' ? styles.badgeTeacher : styles.badgeStudent}`}>
//                                             {user.role}
//                                         </span>
//                                     </td>
//                                     <td style={{ textAlign: 'center' }}>
//                                         <div className={styles.actionCell}>
//                                             {!isCurrentUser ? (
//                                                 <>
//                                                     <button className={`${styles.btnAction} ${styles.btnEdit}`} onClick={() => openEditModal(user)} title="Edit">
//                                                         <i className="fas fa-pen"></i>
//                                                     </button>
//                                                     <button className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => deleteUser(user.id, user.username)} title="Delete" disabled={deletingId === user.id}>
//                                                         {deletingId === user.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-alt"></i>}
//                                                     </button>
//                                                 </>
//                                             ) : (
//                                                 <span className={styles.selfTag}>You</span>
//                                             )}
//                                         </div>
//                                     </td>
//                                 </tr>
//                             );
//                         })}
//                     </tbody>
//                 </table>
//             </div>

//             {createPortal(
//                 <div className={`${styles.modalOverlay} ${modalState.isOpen ? styles.modalOverlayActive : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
//                     <div className={styles.modalContent}>
//                         <div className={styles.modalHeader}>
//                             <h3>{modalState.isEditMode ? 'Edit User Profile' : 'Add New User'}</h3>
//                             <button type="button" className={styles.closeBtn} onClick={closeModal}>&times;</button>
//                         </div>
//                         <form onSubmit={handleFormSubmit}>
//                             <div className={styles.formGroup}>
//                                 <label className={styles.formLabel}>Username</label>
//                                 <input type="text" className={styles.formInput} required value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
//                             </div>
//                             <div className={styles.formGroup}>
//                                 <label className={styles.formLabel}>Email Address</label>
//                                 <input type="email" className={styles.formInput} required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
//                             </div>
//                             <div className={styles.formGroup}>
//                                 <label className={styles.formLabel}>Password</label>
//                                 <input type="password" className={styles.formInput} required={!modalState.isEditMode} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
//                             </div>
//                             <div className={styles.formGroup}>
//                                 <label className={styles.formLabel}>Role Permission</label>
//                                 <div className={styles.formSelectWrapper}>
//                                     <select className={styles.formSelect} value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
//                                         <option value="student">Student</option>
//                                         <option value="teacher">Teacher</option>
//                                         <option value="admin">Administrator</option>
//                                     </select>
//                                 </div>
//                             </div>
//                             <div className={styles.modalFooter}>
//                                 <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancel</button>
//                                 <button type="submit" className={styles.btnSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
//                             </div>
//                         </form>
//                     </div>
//                 </div>, document.body)}
//         </>
//     );
// }

// function RelationManagementPanel({
//     relationSearch,
//     setRelationSearch,
//     relationLoading,
//     relationError,
//     courses,
//     teachers,
//     students,
//     courseForm,
//     setCourseForm,
//     courseSaving,
//     editingCourseId,
//     resetCourseForm,
//     handleCourseSubmit,
//     handleEditCourse,
//     handleDeleteCourse,
//     handleStudentToggle,
//     assignmentForm,
//     setAssignmentForm,
//     assignmentSaving,
//     assignmentCourseId,
//     setAssignmentCourseId,
//     handleAssignmentSubmit,
//     handleDeleteAssignment,
// }) {
//     const filteredCourses = useMemo(() => {
//         const query = relationSearch.toLowerCase().trim();
//         if (!query) return courses;
//         return courses.filter(c =>
//             String(c.courseId || c.id || '').toLowerCase().includes(query) ||
//             String(c.name || '').toLowerCase().includes(query) ||
//             String(c.semester || '').toLowerCase().includes(query) ||
//             String(c.degreeLevel || '').toLowerCase().includes(query)
//         );
//     }, [courses, relationSearch]);

//     return (
//         <>
//             <div className={styles.dashboardHeader}>
//                 <div className={styles.headerTitle}>
//                     <h2>Course-Teacher-Student-Assignment Mapping</h2>
//                     <p>Bind teacher to course, students to course, and assignments to course</p>
//                 </div>
//                 <div className={styles.headerActions}>
//                     <div className={styles.searchWrapper}>
//                         <i className={`fas fa-search ${styles.searchIcon}`}></i>
//                         <input
//                             type="text"
//                             className={styles.searchInput}
//                             placeholder="Search course id/name/semester..."
//                             value={relationSearch}
//                             onChange={(e) => setRelationSearch(e.target.value)}
//                         />
//                     </div>
//                 </div>
//             </div>

//             <div className={styles.relationGrid}>
//                 <form className={styles.dashboardCardInner} onSubmit={handleCourseSubmit}>
//                     <h3>{editingCourseId ? 'Edit Course' : 'Create Course'}</h3>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Course ID</label>
//                         <input className={styles.formInput} value={courseForm.courseId} disabled={!!editingCourseId} onChange={e => setCourseForm({ ...courseForm, courseId: e.target.value })} required />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Course Name</label>
//                         <input className={styles.formInput} value={courseForm.name} onChange={e => setCourseForm({ ...courseForm, name: e.target.value })} required />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Teacher</label>
//                         <div className={styles.formSelectWrapper}>
//                             <select className={styles.formSelect} value={courseForm.teacherId} onChange={e => setCourseForm({ ...courseForm, teacherId: e.target.value })}>
//                                 <option value="">Unassigned</option>
//                                 {teachers.map(t => <option key={t.id} value={t.id}>{t.username} ({t.email})</option>)}
//                             </select>
//                         </div>
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Degree Level</label>
//                         <div className={styles.formSelectWrapper}>
//                             <select className={styles.formSelect} value={courseForm.degreeLevel} onChange={e => setCourseForm({ ...courseForm, degreeLevel: e.target.value })}>
//                                 <option value="bachelor">Bachelor</option>
//                                 <option value="master">Master</option>
//                                 <option value="phd">PhD</option>
//                             </select>
//                         </div>
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Semester</label>
//                         <input className={styles.formInput} placeholder="e.g. 2026-Spring" value={courseForm.semester} onChange={e => setCourseForm({ ...courseForm, semester: e.target.value })} required />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Students</label>
//                         <div className={styles.studentPickList}>
//                             {students.map(s => {
//                                 const sid = s.studentId || s.id;
//                                 const selected = courseForm.studentIds.includes(sid);
//                                 return (
//                                     <button
//                                         type="button"
//                                         key={s.id}
//                                         className={`${styles.studentChip} ${selected ? styles.studentChipActive : ''}`}
//                                         onClick={() => handleStudentToggle(sid)}
//                                     >
//                                         {s.username} ({sid})
//                                     </button>
//                                 );
//                             })}
//                         </div>
//                     </div>
//                     <div className={styles.modalFooter}>
//                         <button type="button" className={styles.btnCancel} onClick={resetCourseForm}>Reset</button>
//                         <button type="submit" className={styles.btnSave} disabled={courseSaving}>{courseSaving ? 'Saving...' : (editingCourseId ? 'Update Course' : 'Create Course')}</button>
//                     </div>
//                 </form>

//                 <form className={styles.dashboardCardInner} onSubmit={handleAssignmentSubmit}>
//                     <h3>Create Assignment</h3>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Course</label>
//                         <div className={styles.formSelectWrapper}>
//                             <select className={styles.formSelect} value={assignmentCourseId} onChange={e => setAssignmentCourseId(e.target.value)} required>
//                                 <option value="">Select Course</option>
//                                 {courses.map(c => <option key={c.courseId || c.id} value={c.courseId || c.id}>{c.courseId || c.id} - {c.name}</option>)}
//                             </select>
//                         </div>
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Assignment ID</label>
//                         <input className={styles.formInput} value={assignmentForm.id} onChange={e => setAssignmentForm({ ...assignmentForm, id: e.target.value })} required />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Title</label>
//                         <input className={styles.formInput} value={assignmentForm.title} onChange={e => setAssignmentForm({ ...assignmentForm, title: e.target.value })} required />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Description</label>
//                         <textarea className={styles.formInput} rows={3} value={assignmentForm.description} onChange={e => setAssignmentForm({ ...assignmentForm, description: e.target.value })} />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Due Date</label>
//                         <input className={styles.formInput} value={assignmentForm.dueDate} onChange={e => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })} placeholder="YYYY-MM-DD" />
//                     </div>
//                     <div className={styles.formGroup}>
//                         <label className={styles.formLabel}>Rubric JSON</label>
//                         <textarea className={styles.formInput} rows={4} value={assignmentForm.rubricText} onChange={e => setAssignmentForm({ ...assignmentForm, rubricText: e.target.value })} />
//                     </div>
//                     <div className={styles.modalFooter}>
//                         <button type="submit" className={styles.btnSave} disabled={assignmentSaving}>{assignmentSaving ? 'Saving...' : 'Create Assignment'}</button>
//                     </div>
//                 </form>
//             </div>

//             {relationLoading && <div className={styles.relationHint}>Loading relation data...</div>}
//             {relationError && <div className={styles.relationError}>{relationError}</div>}

//             <div className={styles.tableResponsive}>
//                 <table className={styles.customTable}>
//                     <thead>
//                         <tr>
//                             <th>Course</th>
//                             <th>Teacher</th>
//                             <th>Degree</th>
//                             <th>Semester</th>
//                             <th>Students</th>
//                             <th>Assignments</th>
//                             <th style={{ textAlign: 'center' }}>Actions</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filteredCourses.map(course => {
//                             const cid = course.courseId || course.id;
//                             const teacher = teachers.find(t => t.id === course.teacherId);
//                             const studentsText = (course.studentList || []).map(s => s.studentId).join(', ') || '-';
//                             return (
//                                 <tr key={cid}>
//                                     <td><strong>{cid}</strong><br />{course.name}</td>
//                                     <td>{teacher ? `${teacher.username}` : (course.teacherId || '-')}</td>
//                                     <td>{course.degreeLevel || '-'}</td>
//                                     <td>{course.semester || '-'}</td>
//                                     <td>{studentsText}</td>
//                                     <td>
//                                         {(course.assignments || []).length === 0 ? '-' : (
//                                             <div className={styles.assignmentList}>
//                                                 {(course.assignments || []).map(a => (
//                                                     <div key={a.id} className={styles.assignmentItem}>
//                                                         <span>{a.id}: {a.title}</span>
//                                                         <button type="button" className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => handleDeleteAssignment(cid, a.id)}>
//                                                             <i className="fas fa-trash-alt"></i>
//                                                         </button>
//                                                     </div>
//                                                 ))}
//                                             </div>
//                                         )}
//                                     </td>
//                                     <td style={{ textAlign: 'center' }}>
//                                         <div className={styles.actionCell}>
//                                             <button className={`${styles.btnAction} ${styles.btnEdit}`} onClick={() => handleEditCourse(course)}>
//                                                 <i className="fas fa-pen"></i>
//                                             </button>
//                                             <button className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => handleDeleteCourse(cid, course.name)}>
//                                                 <i className="fas fa-trash-alt"></i>
//                                             </button>
//                                         </div>
//                                     </td>
//                                 </tr>
//                             );
//                         })}
//                     </tbody>
//                 </table>
//             </div>
//         </>
//     );
// }

// export default function AdminDashboard(props) {
//     const { activeMode, setActiveMode, users } = props;

//     // Custom confirm state mapped dynamically
//     const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', text: '', onConfirm: null });
//     const openConfirm = (title, text, onConfirm) => setConfirmConfig({ isOpen: true, title, text, onConfirm });
//     const closeConfirm = () => setConfirmConfig({ ...confirmConfig, isOpen: false });

//     // Override the props that trigger window.confirm
//     const interceptedProps = {
//         ...props,
//         deleteUser: (uid, uname) => openConfirm('Delete User', `Are you sure you want to delete "${uname}"? This action cannot be undone.`, () => props.deleteUser(uid, uname)),
//         handleDeleteCourse: (cid, name) => openConfirm('Delete Course', `Delete course ${name || cid}?`, () => props.handleDeleteCourse(cid, name)),
//         handleDeleteAssignment: (cid, aId) => openConfirm('Delete Assignment', `Delete assignment ${aId}?`, () => props.handleDeleteAssignment(cid, aId))
//     };

//     const stats = useMemo(() => ({
//         total: users.length,
//         admins: users.filter(u => u.role === 'admin').length,
//         teachers: users.filter(u => u.role === 'teacher').length,
//         students: users.filter(u => u.role === 'student').length,
//     }), [users]);

//     return (
//         <div className={`global-admin-dashboard ${styles.dashboardPageWrap}`}>
//             <div className={styles.bgOrb}></div>
//             <div className={styles.adminContainer}>
//                 <div className={styles.statsGrid}>
//                     <div className={`${styles.statCard} ${styles.cardTotal}`}><div className={styles.statInfo}><h3>Total Users</h3><div className={styles.count}>{stats.total}</div></div><div className={styles.statIcon}><i className="fas fa-users"></i></div></div>
//                     <div className={`${styles.statCard} ${styles.cardAdmin}`}><div className={styles.statInfo}><h3>Administrators</h3><div className={styles.count}>{stats.admins}</div></div><div className={styles.statIcon}><i className="fas fa-user-shield"></i></div></div>
//                     <div className={`${styles.statCard} ${styles.cardTeacher}`}><div className={styles.statInfo}><h3>Teachers</h3><div className={styles.count}>{stats.teachers}</div></div><div className={styles.statIcon}><i className="fas fa-chalkboard-teacher"></i></div></div>
//                     <div className={`${styles.statCard} ${styles.cardStudent}`}><div className={styles.statInfo}><h3>Students</h3><div className={styles.count}>{stats.students}</div></div><div className={styles.statIcon}><i className="fas fa-user-graduate"></i></div></div>
//                 </div>

//                 <div className={styles.adminWorkspace}>
//                     <ModeSidebar activeMode={activeMode} setActiveMode={setActiveMode} />
//                     <div className={styles.dashboardCard}>
//                         {activeMode === 'users' ? (
//                             <UserManagementPanel {...interceptedProps} />
//                         ) : (
//                             <RelationManagementPanel {...interceptedProps} />
//                         )}
//                     </div>
//                 </div>
//             </div>
//             {createPortal(
//                 <div className={`${styles.modalOverlay} ${confirmConfig.isOpen ? styles.modalOverlayActive : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}>
//                     <div className={styles.modalContent}>
//                         <div className={styles.modalHeader}>
//                             <h3>{confirmConfig.title}</h3>
//                             <button className={styles.closeBtn} onClick={closeConfirm}>&times;</button>
//                         </div>
//                         <div style={{ marginBottom: '25px', color: '#555', fontSize: '1rem' }}>{confirmConfig.text}</div>
//                         <div className={styles.modalFooter}>
//                             <button className={styles.btnCancel} onClick={closeConfirm}>Cancel</button>
//                             <button className={styles.btnSave} style={{ background: '#f43f5e', border: 'none', color: '#fff' }} onClick={() => { if (confirmConfig.onConfirm) confirmConfig.onConfirm(); closeConfirm(); }}>Delete</button>
//                         </div>
//                     </div>
//                 </div>, document.body
//             )}
//         </div>
//     );
// }
