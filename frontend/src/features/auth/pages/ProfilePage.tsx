import React, { useEffect, useState } from 'react';
import client from '../../../api/client';
import Profile from '../Profile';

export default function ProfilePage() {
    const storedUser = JSON.parse(localStorage.getItem('user'));

    const [formData, setFormData] = useState({
        username: storedUser?.username || '',
        email: storedUser?.email || '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [alert, setAlert] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [profileCourses, setProfileCourses] = useState([]);
    const [courseSemester, setCourseSemester] = useState('');
    const [isCoursesLoading, setIsCoursesLoading] = useState(true);

    // History TTL settings
    const [historyTtlDays, setHistoryTtlDays] = useState(90);
    const [ttlInput, setTtlInput] = useState('90');
    const [ttlPermanent, setTtlPermanent] = useState(false);
    const [ttlSaving, setTtlSaving] = useState(false);
    const [ttlAlert, setTtlAlert] = useState(null);

    const getRoleInfo = (role) => {
        switch (role) {
            case 'admin': return { icon: 'fa-shield-alt', text: 'Administrator' };
            case 'teacher': return { icon: 'fa-chalkboard-teacher', text: 'Teacher' };
            default: return { icon: 'fa-user-graduate', text: 'Student' };
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.id]: e.target.value });
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        setShowModal(true);
    };

    const handleSaveProfile = async () => {
        setShowModal(false);
        setIsLoading(true);
        try {
            const response = await client.post('/profile/update', {
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password.trim()
            });

            const newUser = { ...storedUser, username: formData.username, email: formData.email };
            localStorage.setItem('user', JSON.stringify(newUser));

            setAlert({ type: 'success', message: 'Profile updated successfully!' });
            setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
            setAlert({ type: 'error', message: error.response?.data?.message || 'Update failed' });
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
                // ignore — use defaults
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
            setTtlAlert({ type: 'error', message: 'Please enter a number of days (1 or more).' });
            return;
        }
        setTtlSaving(true);
        setTtlAlert(null);
        try {
            await client.post('/profile/history-settings', { history_ttl_days: days });
            setHistoryTtlDays(days);
            setTtlAlert({ type: 'success', message: 'History cleanup setting saved!' });
        } catch {
            setTtlAlert({ type: 'error', message: 'Failed to save setting.' });
        } finally {
            setTtlSaving(false);
        }
    };

    return (
        <Profile
            user={storedUser}
            formData={formData}
            handleInputChange={handleInputChange}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            alert={alert}
            showModal={showModal}
            setShowModal={setShowModal}
            isLoading={isLoading}
            handleFormSubmit={handleFormSubmit}
            handleSaveProfile={handleSaveProfile}
            roleInfo={getRoleInfo(storedUser?.role)}
            profileCourses={profileCourses}
            courseSemester={courseSemester}
            isCoursesLoading={isCoursesLoading}
            handleModalBackgroundClick={(e) => e.target.classList.contains('modal-overlay') && setShowModal(false)}
            historyTtlDays={historyTtlDays}
            ttlInput={ttlInput}
            setTtlInput={setTtlInput}
            ttlPermanent={ttlPermanent}
            setTtlPermanent={setTtlPermanent}
            ttlSaving={ttlSaving}
            ttlAlert={ttlAlert}
            handleSaveHistoryTtl={handleSaveHistoryTtl}
        />
    );
}
