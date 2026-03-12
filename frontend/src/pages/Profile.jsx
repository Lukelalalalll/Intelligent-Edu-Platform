import React from 'react';
import '../styles/profile.css';

export default function Profile({
    user, formData, handleInputChange, showPassword, setShowPassword,
    alert, showModal, setShowModal, isLoading, handleFormSubmit,
    handleSaveProfile, handleModalBackgroundClick, roleInfo
}) {
    return (
        <>
            <div className="profile-wrapper">
                <div className="bg-orb"></div>
                <div className="profile-container">
                    {/* 顶部卡片：信息展示 */}
                    <div className="profile-header-card">
                        <div className="avatar-circle"><i className="fas fa-user-astronaut"></i></div>
                        <div className="profile-info">
                            <h2>{user.username}</h2>
                            <p><i className="fas fa-envelope"></i> {user.email}</p>
                            <div className={`role-badge ${user.role}`}>
                                <i className={`fas ${roleInfo.icon}`}></i> {roleInfo.text}
                            </div>
                        </div>
                    </div>

                    {/* 底部卡片：编辑表单 */}
                    <div className="profile-edit-card">
                        <div className="card-header">
                            <h3><i className="fas fa-user-edit"></i> Edit Profile</h3>
                            <p className="edit-subtitle">Update your personal details and security settings.</p>
                        </div>

                        <form className="auth-form" onSubmit={handleFormSubmit}>
                            {alert && (
                                <div className={`alert ${alert.type}`} style={{ display: 'flex' }}>
                                    <i className={`fas ${alert.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                    {alert.message}
                                </div>
                            )}

                            <div className="form-group">
                                <label>Username</label>
                                <div className="input-with-icon">
                                    <input type="text" id="username" value={formData.username} onChange={handleInputChange} required />
                                    <i className="fas fa-user input-icon"></i>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Email Address</label>
                                <div className="input-with-icon">
                                    <input type="email" id="email" value={formData.email} onChange={handleInputChange} required />
                                    <i className="fas fa-envelope input-icon"></i>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>New Password</label>
                                <div className="input-with-icon">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        placeholder="Leave blank to keep current password"
                                    />
                                    <i className="fas fa-lock input-icon"></i>
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                                       onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer' }}></i>
                                </div>
                            </div>

                            <button type="submit" className="btn-save" disabled={isLoading}>
                                {isLoading ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save Changes</>}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* 确认弹窗 */}
            {showModal && (
                <div className="modal-overlay active" onClick={handleModalBackgroundClick}>
                    <div className="modal-box">
                        <div className="modal-icon"><i className="fas fa-exclamation-triangle"></i></div>
                        <h3>Confirm Changes</h3>
                        <p>You are about to update your profile. If you changed your password, you may need to log in again.</p>
                        <div className="modal-actions">
                            <button className="btn-modal btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn-modal btn-confirm" onClick={handleSaveProfile}>Confirm Update</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}