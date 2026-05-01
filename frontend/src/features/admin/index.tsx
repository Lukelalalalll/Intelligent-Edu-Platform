import React, { useMemo, useState } from 'react';
import styles from './styles/AdminDashboard.module.css';

import ModeSidebar from './components/ModeSidebar';
import UserManagementPanel from './components/UserManagementPanel';
import RelationManagementPanel from './components/RelationManagementPanel';
import LLMMonitorPanel from './components/LLMMonitorPanel';
import ApiKeyPanel from './components/ApiKeyPanel';
import StaffCodesPanel from './components/StaffCodesPanel';
import RAGEvalPanel from './components/RAGEvalPanel';
import ConfirmModal from './components/ConfirmModal';

export default function AdminBoardPage(props) {
    const { activeMode, setActiveMode, users } = props;

    // Confirm Modal State
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', text: '', onConfirm: null });
    const openConfirm = (title, text, onConfirm) => setConfirmConfig({ isOpen: true, title, text, onConfirm });
    const closeConfirm = () => setConfirmConfig({ ...confirmConfig, isOpen: false });

    // Intercept delete methods to trigger the global ConfirmModal
    const interceptedProps = {
        ...props,
        deleteUser: (uid, uname) => openConfirm('Delete User', `Are you sure you want to delete "${uname}"? This action cannot be undone.`, () => props.deleteUser(uid, uname)),
        handleDeleteCourse: (cid, name) => openConfirm('Delete Course', `Delete course ${name || cid}?`, () => props.handleDeleteCourse(cid, name)),
        handleDeleteAssignment: (cid, aId) => openConfirm('Delete Assignment', `Delete assignment ${aId}?`, () => props.handleDeleteAssignment(cid, aId))
    };

    // Top statistics
    const stats = useMemo(() => ({
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        teachers: users.filter(u => u.role === 'teacher').length,
        students: users.filter(u => u.role === 'student').length,
    }), [users]);

    return (
        <div className={`global-admin-dashboard ${styles.dashboardPageWrap}`}>
            <div className={styles.bgOrb}></div>
            <div className={styles.adminContainer}>
                
                {/* Top four statistics cards */}
                <div className={styles.statsGrid}>
                    <div className={`${styles.statCard} ${styles.cardTotal}`}><div className={styles.statInfo}><h3>Total Users</h3><div className={styles.count}>{stats.total}</div></div><div className={styles.statIcon}><i className="fas fa-users"></i></div></div>
                    <div className={`${styles.statCard} ${styles.cardAdmin}`}><div className={styles.statInfo}><h3>Administrators</h3><div className={styles.count}>{stats.admins}</div></div><div className={styles.statIcon}><i className="fas fa-user-shield"></i></div></div>
                    <div className={`${styles.statCard} ${styles.cardTeacher}`}><div className={styles.statInfo}><h3>Teachers</h3><div className={styles.count}>{stats.teachers}</div></div><div className={styles.statIcon}><i className="fas fa-chalkboard-teacher"></i></div></div>
                    <div className={`${styles.statCard} ${styles.cardStudent}`}><div className={styles.statInfo}><h3>Students</h3><div className={styles.count}>{stats.students}</div></div><div className={styles.statIcon}><i className="fas fa-user-graduate"></i></div></div>
                </div>

                {/* Main workspace */}
                <div className={styles.adminWorkspace}>
                    <ModeSidebar activeMode={activeMode} setActiveMode={setActiveMode} />
                    
                    <div className={styles.dashboardCard}>
                        {activeMode === 'users' && <UserManagementPanel {...interceptedProps} />}
                        {activeMode === 'relations' && <RelationManagementPanel {...interceptedProps} />}
                        {activeMode === 'llm-monitor' && <LLMMonitorPanel />}
                        {activeMode === 'api-keys' && <ApiKeyPanel />}
                        {activeMode === 'staff-codes' && <StaffCodesPanel openConfirm={openConfirm} />}
                        {activeMode === 'rag-eval' && <RAGEvalPanel />}
                    </div>
                </div>
            </div>

            {/* Global confirmation modal */}
            <ConfirmModal confirmConfig={confirmConfig} closeConfirm={closeConfirm} />
        </div>
    );
}