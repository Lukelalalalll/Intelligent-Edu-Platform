import React from 'react';
import styles from '../styles/profile.module.css';

export default function Profile({
    user, formData, handleInputChange, showPassword, setShowPassword,
    alert, showModal, setShowModal, isLoading, handleFormSubmit,
    handleSaveProfile, handleModalBackgroundClick, roleInfo,
    profileCourses, courseSemester, isCoursesLoading,
    historyTtlDays, ttlInput, setTtlInput, ttlPermanent, setTtlPermanent,
    ttlSaving, ttlAlert, handleSaveHistoryTtl,
}) {
    const isTeacher = user?.role === 'teacher';
    const courseTitle = isTeacher ? 'Teaching Courses' : 'Enrolled Courses';
    const courseSubtitle = isTeacher
        ? `Current semester: ${courseSemester || 'N/A'}`
        : 'Courses currently linked to your profile';

    return (
        <>
            <div className={`global-profile-wrapper ${styles.profileWrapper}`}>
                <div className={styles.bgOrb}></div>
                <div className={styles.profileContainer}>
                    <div className={styles.profileGrid}>
                        <div className={styles.leftColumn}>
                            <div className={styles.profileHeaderCard}>
                                <div className={styles.avatarCircle}><i className="fas fa-user-astronaut"></i></div>
                                <div className={styles.profileInfo}>
                                    <h2>{user.username}</h2>
                                    <p><i className="fas fa-envelope"></i> {user.email}</p>
                                    <div className={`${styles.roleBadge} ${styles[user.role] || ''}`}>
                                        <i className={`fas ${roleInfo.icon}`}></i> {roleInfo.text}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.profileCoursesCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-book-open"></i> {courseTitle}</h3>
                                    <p className={styles.editSubtitle}>{courseSubtitle}</p>
                                </div>

                                {isCoursesLoading ? (
                                    <div className={styles.courseState}>Loading courses...</div>
                                ) : profileCourses?.length ? (
                                    <div className={styles.courseList}>
                                        {profileCourses.map((course) => (
                                            <div className={styles.courseItem} key={course.courseId || course.id}>
                                                <div className={styles.courseMainInfo}>
                                                    <div className={styles.courseCode}>{course.courseId || course.id}</div>
                                                    <div className={styles.courseName}>{course.name}</div>
                                                </div>
                                                <div className={styles.courseMeta}>
                                                    <span>{course.degreeLevel || 'N/A'}</span>
                                                    <span>{course.semester || 'N/A'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.courseState}>No courses found for this profile.</div>
                                )}
                            </div>
                        </div>

                        <div className={styles.rightColumn}>
                            <div className={styles.profileEditCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-user-edit"></i> Edit Profile</h3>
                                    <p className={styles.editSubtitle}>Update your personal details and security settings.</p>
                                </div>


                                <form className="auth-form" onSubmit={handleFormSubmit}>
                                    {alert && (
                                        <div className={`${styles.alert} ${styles[alert.type] || ''}`} style={{ display: 'flex' }}>
                                            <i className={`fas ${alert.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                            {alert.message}
                                        </div>
                                    )}

                                    <div className={styles.formGroup}>
                                        <label>Username</label>
                                        <div className={styles.inputWithIcon}>
                                            <input type="text" id="username" value={formData.username} onChange={handleInputChange} required />
                                            <i className={`fas fa-user ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Email Address</label>
                                        <div className={styles.inputWithIcon}>
                                            <input type="email" id="email" value={formData.email} onChange={handleInputChange} required />
                                            <i className={`fas fa-envelope ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>New Password</label>
                                        <div className={styles.inputWithIcon}>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                id="password"
                                                value={formData.password}
                                                onChange={handleInputChange}
                                                placeholder="Leave blank to keep current password"
                                            />
                                            <i className={`fas fa-lock ${styles.inputIcon}`}></i>
                                            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} ${styles.togglePassword}`}
                                                onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer' }}></i>
                                        </div>
                                    </div>

                                    <button type="submit" className={styles.btnSave} disabled={isLoading}>
                                        {isLoading ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save Changes</>}
                                    </button>
                                </form>
                            </div>

                            <div className={styles.profileEditCard}>
                                <div className={styles.cardHeader}>
                                    <h3><i className="fas fa-clock"></i> History Auto-Cleanup</h3>
                                    <p className={styles.editSubtitle}>Choose how long to keep your generation history records.</p>
                                </div>

                                {ttlAlert && (
                                    <div className={`${styles.alert} ${styles[ttlAlert.type] || ''}`} style={{ display: 'flex' }}>
                                        <i className={`fas ${ttlAlert.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                        {ttlAlert.message}
                                    </div>
                                )}

                                <div className={styles.formGroup}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={ttlPermanent}
                                            onChange={(e) => {
                                                setTtlPermanent(e.target.checked);
                                                if (e.target.checked) setTtlInput('');
                                            }}
                                        />
                                        Keep history permanently (never auto-delete)
                                    </label>
                                </div>

                                {!ttlPermanent && (
                                    <div className={styles.formGroup}>
                                        <label>Auto-delete history after (days)</label>
                                        <div className={styles.inputWithIcon}>
                                            <input
                                                type="number"
                                                min={1}
                                                max={3650}
                                                value={ttlInput}
                                                onChange={(e) => setTtlInput(e.target.value)}
                                                placeholder="90"
                                            />
                                            <i className={`fas fa-calendar-alt ${styles.inputIcon}`}></i>
                                        </div>
                                    </div>
                                )}

                                <button className={styles.btnSave} disabled={ttlSaving} onClick={handleSaveHistoryTtl}>
                                    {ttlSaving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save Setting</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {showModal && (
                <div className={`${styles.modalOverlay} ${styles.active}`} onClick={handleModalBackgroundClick}>
                    <div className={styles.modalBox}>
                        <div className={styles.modalIcon}><i className="fas fa-exclamation-triangle"></i></div>
                        <h3>Confirm Changes</h3>
                        <p>You are about to update your profile. If you changed your password, you may need to log in again.</p>
                        <div className={styles.modalActions}>
                            <button className={`${styles.btnModal} ${styles.btnCancel}`} onClick={() => setShowModal(false)}>Cancel</button>
                            <button className={`${styles.btnModal} ${styles.btnConfirm}`} onClick={handleSaveProfile}>Confirm Update</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
