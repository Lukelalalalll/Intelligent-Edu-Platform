import React, { useState, useEffect } from 'react';
import client from '@/shared/api/client';
import AdminDashboard from '../index';
import { log } from '@/shared/utils/logger'; 

export default function AdminDashboardPage() {
    // === 1. 全局状态 ===
    const [activeMode, setActiveMode] = useState('users');
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentUserId = currentUser.id;

    // === 2. 用户管理状态 (User Management) ===
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [modalState, setModalState] = useState({ isOpen: false, isEditMode: false });
    const [formData, setFormData] = useState({ id: '', username: '', email: '', password: '', role: 'teacher' });
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // === 3. 课程关系管理状态 (Relation Management) ===
    const [relationSearch, setRelationSearch] = useState('');
    const [relationLoading, setRelationLoading] = useState(false);
    const [relationError, setRelationError] = useState('');
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);

    const [courseForm, setCourseForm] = useState({
        courseId: '', name: '', teacherId: '', degreeLevel: 'bachelor', semester: '', studentIds: [],
    });
    const [courseSaving, setCourseSaving] = useState(false);
    const [editingCourseId, setEditingCourseId] = useState(null);

    const [assignmentForm, setAssignmentForm] = useState({
        id: '', title: '', description: '', dueDate: '', 
        rubricText: '{"correctness":40,"codeStyle":20,"completeness":20,"explanation":20}',
    });
    const [assignmentSaving, setAssignmentSaving] = useState(false);
    const [assignmentCourseId, setAssignmentCourseId] = useState('');

    // --- 数据获取 (Fetching) ---
    const fetchUsers = async () => {
        try {
            const response = await client.get('/admin/users');
            setUsers(response.data);
        } catch (error) {
            if (log && log.error) log.error('admin-dashboard', 'Failed to fetch users', { message: error?.message });
            else console.error('Failed to fetch users:', error);
        }
    };

    const fetchRelations = async () => {
        try {
            setRelationLoading(true); setRelationError('');
            const response = await client.get('/admin/relations/overview');
            setCourses(response.data?.courses || []);
            setTeachers(response.data?.teachers || []);
            setStudents(response.data?.students || []);
        } catch (error) {
            setRelationError(error.response?.data?.detail || 'Failed to load relation data');
        } finally {
            setRelationLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchRelations();
    }, []);

    // --- 用户管理操作 (User Operations) ---
    const openAddModal = () => { setFormData({ id: '', username: '', email: '', password: '', role: 'teacher' }); setModalState({ isOpen: true, isEditMode: false }); };
    const openEditModal = (user) => { setFormData({ id: user.id, username: user.username, email: user.email, password: '', role: user.role || 'student' }); setModalState({ isOpen: true, isEditMode: true }); };
    const closeModal = () => setModalState({ isOpen: false, isEditMode: false });

    const handleFormSubmit = async (e) => {
        e.preventDefault(); setIsSaving(true);
        const { id, username, email, role, password } = formData;
        try {
            if (modalState.isEditMode) await client.put(`/admin/update_user/${id}`, { username, email, role, password });
            else await client.post(`/admin/add_user`, { username, email, role, password });
            closeModal(); fetchUsers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || 'Operation failed'));
        } finally {
            setIsSaving(false);
        }
    };

    const deleteUser = async (userId) => {
        setDeletingId(userId);
        try {
            await client.delete(`/admin/delete_user/${userId}`);
            setUsers(prev => prev.filter(u => u.id !== userId)); 
        } catch (err) {
            alert('Failed to delete user: ' + (err.response?.data?.message || 'Network error'));
        } finally {
            setDeletingId(null);
        }
    };

    // --- 课程与作业管理操作 (Course & Assignment Operations) ---
    const resetCourseForm = () => {
        setCourseForm({ courseId: '', name: '', teacherId: '', degreeLevel: 'bachelor', semester: '', studentIds: [] });
        setEditingCourseId(null);
    };

    const handleCourseSubmit = async (e) => {
        e.preventDefault(); setCourseSaving(true);
        try {
            if (editingCourseId) await client.put(`/admin/courses/${editingCourseId}`, courseForm);
            else await client.post('/admin/courses', courseForm);
            resetCourseForm(); fetchRelations();
        } catch (error) {
            alert(error.response?.data?.detail || 'Course save failed');
        } finally {
            setCourseSaving(false);
        }
    };

    const handleEditCourse = (course) => {
        setEditingCourseId(course.courseId || course.id);
        setCourseForm({
            courseId: course.courseId || course.id || '', name: course.name || '',
            teacherId: course.teacherId || '', degreeLevel: course.degreeLevel || 'bachelor',
            semester: course.semester || '', studentIds: (course.studentList || []).map(s => s.studentId).filter(Boolean),
        });
    };

    const handleDeleteCourse = async (courseId) => {
        try {
            await client.delete(`/admin/courses/${courseId}`);
            fetchRelations();
            if (editingCourseId === courseId) resetCourseForm();
        } catch (error) {
            alert(error.response?.data?.detail || 'Delete course failed');
        }
    };

    const handleStudentToggle = (studentId) => {
        setCourseForm(prev => ({
            ...prev,
            studentIds: prev.studentIds.includes(studentId) 
                ? prev.studentIds.filter(id => id !== studentId) 
                : [...prev.studentIds, studentId]
        }));
    };

    const handleAssignmentSubmit = async (e) => {
        e.preventDefault();
        if (!assignmentCourseId) return alert('Please select course for assignment');
        let rubric = {};
        try { rubric = assignmentForm.rubricText.trim() ? JSON.parse(assignmentForm.rubricText) : {}; } 
        catch (_) { return alert('Rubric must be valid JSON'); }

        setAssignmentSaving(true);
        try {
            await client.post(`/admin/courses/${assignmentCourseId}/assignments`, {
                id: assignmentForm.id, title: assignmentForm.title, description: assignmentForm.description,
                dueDate: assignmentForm.dueDate, rubric,
            });
            setAssignmentForm({ id: '', title: '', description: '', dueDate: '', rubricText: '{"correctness":40,"codeStyle":20,"completeness":20,"explanation":20}' });
            fetchRelations();
        } catch (error) {
            alert(error.response?.data?.detail || 'Create assignment failed');
        } finally {
            setAssignmentSaving(false);
        }
    };

    const handleDeleteAssignment = async (courseId, assignmentId) => {
        try {
            await client.delete(`/admin/courses/${courseId}/assignments/${assignmentId}`);
            fetchRelations();
        } catch (error) {
            alert(error.response?.data?.detail || 'Delete assignment failed');
        }
    };

    return (
        <AdminDashboard
            activeMode={activeMode} setActiveMode={setActiveMode} currentUserId={currentUserId}
            users={users} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            modalState={modalState} formData={formData} setFormData={setFormData}
            isSaving={isSaving} deletingId={deletingId}
            openAddModal={openAddModal} openEditModal={openEditModal} closeModal={closeModal}
            handleFormSubmit={handleFormSubmit} deleteUser={deleteUser}
            relationSearch={relationSearch} setRelationSearch={setRelationSearch}
            relationLoading={relationLoading} relationError={relationError}
            courses={courses} teachers={teachers} students={students}
            courseForm={courseForm} setCourseForm={setCourseForm}
            courseSaving={courseSaving} editingCourseId={editingCourseId}
            resetCourseForm={resetCourseForm} handleCourseSubmit={handleCourseSubmit}
            handleEditCourse={handleEditCourse} handleDeleteCourse={handleDeleteCourse}
            handleStudentToggle={handleStudentToggle} assignmentForm={assignmentForm}
            setAssignmentForm={setAssignmentForm} assignmentSaving={assignmentSaving}
            assignmentCourseId={assignmentCourseId} setAssignmentCourseId={setAssignmentCourseId}
            handleAssignmentSubmit={handleAssignmentSubmit} handleDeleteAssignment={handleDeleteAssignment}
        />
    );
}
