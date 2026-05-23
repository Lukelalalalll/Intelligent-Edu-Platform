import React, { useEffect, useState } from 'react';
import client from '@/shared/api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/shared/store/useAuthStore';
import styles from '../styles/profile.module.css';

export default function ProfilePage() {
    const { user, updateProfile } = useAuthStore();

    const [formData, setFormData] = useState({
        username: user?.username || '',
        email: user?.email || '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [profileCourses, setProfileCourses] = useState<any[]>([]);
    const [courseSemester, setCourseSemester] = useState('');
    const [isCoursesLoading, setIsCoursesLoading] = useState(true);

    // History TTL settings
    const [historyTtlDays, setHistoryTtlDays] = useState(90);
    const [ttlInput, setTtlInput] = useState('90');
    const [ttlPermanent, setTtlPermanent] = useState(false);
    const [ttlSaving, setTtlSaving] = useState(false);

    const getRoleInfo = (role?: string) => {
        switch (role) {
            case 'admin': return { icon: 'fa-shield-alt', text: 'Administrator' };
            case 'teacher': return { icon: 'fa-chalkboard-teacher', text: 'Teacher' };
            default: return { icon: 'fa-user-graduate', text: 'Student' };
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setShowModal(true);
    };

    const handleSaveProfile = async () => {
        setShowModal(false);
        setIsLoading(true);
        try {
            await client.post('/profile/update', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password.trim()
            });

            updateProfile({ username: formData.username, email: formData.email });
            toast.success('Profile updated successfully!');
            // Removed reload: Zustand handles it reactively now
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Update failed');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const loadProfileCourses = async () => {
            try {
                setIsCoursesLoading(true);
                const response = await client.get('/profile/courses');
                if (!isMounted) return;
                setProfileCourses(response.data?.courses || []);
                setCourseSemester(response.data?.semester || '');
            } catch (error) {
                if (!isMounted) return;
                setProfileCourses([]);
            } finally {
                if (isMounted) setIsCoursesLoading(false);
            }
        };

        const loadHistorySettings = async () => {
            try {
                const res = await client.get('/profile/history-settings');
                if (!isMounted) return;
                const days = res.data?.history_ttl_days ?? 90;
                setHistoryTtlDays(days);
                setTtlInput(days === 0 ? '' : String(days));
                setTtlPermanent(days === 0);
            } catch {
                // ignore
            }
        };

        loadProfileCourses();
        loadHistorySettings();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleSaveHistoryTtl = async () => {
        const days = ttlPermanent ? 0 : parseInt(ttlInput, 10);
        if (!ttlPermanent && (isNaN(days) || days < 1)) {
            toast.error('Please enter a number of days (1 or more).');
            return;
        }
        setTtlSaving(true);
        try {
            await client.post('/profile/history-settings', { history_ttl_days: days });
            setHistoryTtlDays(days);
            toast.success('History cleanup setting saved!');
        } catch {
            toast.error('Failed to save setting.');
        } finally {
            setTtlSaving(false);
        }
    };

    if (!user) return null;

    const isTeacher = user?.role === 'teacher';
    const courseTitle = isTeacher ? 'Teaching Courses' : 'Enrolled Courses';
    const courseSubtitle = isTeacher
        ? `Current semester: ${courseSemester || 'N/A'}`
        : 'Courses currently linked to your profile';
    const roleInfo = getRoleInfo(user?.role);

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
                                    <div className={`${styles.roleBadge} ${styles[user.role || 'student'] || ''}`}>
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
                <div className={`${styles.modalOverlay} ${styles.active}`} onClick={(e: any) => e.target.classList.contains('modal-overlay') && setShowModal(false)}>
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
