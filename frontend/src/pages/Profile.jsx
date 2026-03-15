import React from 'react';
// 【修改处】导入 Module CSS 样式对象
import styles from '../styles/profile.module.css';

export default function Profile({
    user, formData, handleInputChange, showPassword, setShowPassword,
    alert, showModal, setShowModal, isLoading, handleFormSubmit,
    handleSaveProfile, handleModalBackgroundClick, roleInfo
}) {
    return (
        <>
            <div className={`global-profile-wrapper ${styles.profileWrapper}`}>
                <div className={styles.bgOrb}></div>
                <div className={styles.profileContainer}>

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