import React, { useMemo, useState } from 'react';
import styles from '../styles/AdminDashboard.module.css';
import type { User, Course, CourseFormData, AssignmentFormData, ModalState, FormData, ConfirmConfig, AdminMode, Assignment } from '../types';

import ModeSidebar from './ModeSidebar';
import UserManagementPanel from './UserManagementPanel';
import RelationManagementPanel from './RelationManagementPanel';
import LLMMonitorPanel from './LLMMonitorPanel';
import ApiKeyPanel from './ApiKeyPanel';
import StaffCodesPanel from './StaffCodesPanel';
import RAGEvalPanel from './RAGEvalPanel';
import ConfirmModal from './ConfirmModal';

export interface AdminDashboardProps {
  activeMode: AdminMode;
  setActiveMode: React.Dispatch<React.SetStateAction<AdminMode>>;
  currentUserId: string;
  /* User management */
  users: User[];
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  modalState: ModalState;
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  isSaving: boolean;
  deletingId: string | null;
  openAddModal: () => void;
  openEditModal: (user: User) => void;
  closeModal: () => void;
  handleFormSubmit: (e: React.FormEvent) => void;
  deleteUser: (userId: string) => void;
  /* Relation management */
  relationSearch: string;
  setRelationSearch: React.Dispatch<React.SetStateAction<string>>;
  relationLoading: boolean;
  relationError: string;
  courses: Course[];
  teachers: User[];
  students: User[];
  courseForm: CourseFormData;
  setCourseForm: React.Dispatch<React.SetStateAction<CourseFormData>>;
  courseSaving: boolean;
  editingCourseId: string | null;
  resetCourseForm: () => void;
  handleCourseSubmit: (e: React.FormEvent) => void;
  handleEditCourse: (course: Course) => void;
  handleDeleteCourse: (courseId: string) => void;
  handleStudentToggle: (studentId: string) => void;
  /* Assignment management */
  assignmentForm: AssignmentFormData;
  setAssignmentForm: React.Dispatch<React.SetStateAction<AssignmentFormData>>;
  assignmentSaving: boolean;
  assignmentCourseId: string;
  setAssignmentCourseId: React.Dispatch<React.SetStateAction<string>>;
  handleAssignmentSubmit: (e: React.FormEvent) => void;
  handleDeleteAssignment: (courseId: string, assignmentId: string) => void;
}

export default function AdminBoardPage(props: AdminDashboardProps) {
    const { activeMode, setActiveMode, users } = props;

    // Confirm Modal State
    const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({ isOpen: false, title: '', text: '', onConfirm: null });
    const openConfirm = (title: string, text: string, onConfirm: () => void) => setConfirmConfig({ isOpen: true, title, text, onConfirm });
    const closeConfirm = () => setConfirmConfig({ ...confirmConfig, isOpen: false });

    // Intercept delete methods to trigger the global ConfirmModal
    const interceptedProps = {
        ...props,
        deleteUser: (uid: string, uname: string) => openConfirm('Delete User', `Are you sure you want to delete "${uname}"? This action cannot be undone.`, () => props.deleteUser(uid)),
        handleDeleteCourse: (cid: string, name: string) => openConfirm('Delete Course', `Delete course ${name || cid}?`, () => props.handleDeleteCourse(cid)),
        handleDeleteAssignment: (cid: string, aId: string) => openConfirm('Delete Assignment', `Delete assignment ${aId}?`, () => props.handleDeleteAssignment(cid, aId))
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