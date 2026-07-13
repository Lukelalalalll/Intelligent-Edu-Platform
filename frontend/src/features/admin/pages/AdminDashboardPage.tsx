import React, { useState, useEffect } from 'react';
import client from '@/shared/api/client';
import toast from 'react-hot-toast';
import AdminDashboard from '../components/AdminDashboard';
import { log } from '@/shared/utils/logger';
import { useAuthStore } from '@/shared/store/useAuthStore';
import type { User, Course, CourseFormData, AssignmentFormData, FormData, ModalState, AdminMode } from '../types';

interface AxiosErrorResponse {
  response?: {
    data?: {
      detail?: string;
      message?: string;
    };
  };
  message?: string;
}

function isAxiosError(error: unknown): error is AxiosErrorResponse {
  return typeof error === 'object' && error !== null && 'response' in error;
}

export default function AdminDashboardPage() {
    const [activeMode, setActiveMode] = useState<AdminMode>('users');
    const storeUser = useAuthStore((s) => s.user);
    const currentUserId = storeUser?.id ? String(storeUser.id) : '';

    const [users, setUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [modalState, setModalState] = useState<ModalState>({ isOpen: false, isEditMode: false });
    const [formData, setFormData] = useState<FormData>({ id: '', username: '', email: '', password: '', role: 'teacher' });
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [relationSearch, setRelationSearch] = useState('');
    const [relationLoading, setRelationLoading] = useState(false);
    const [relationError, setRelationError] = useState('');
    const [courses, setCourses] = useState<Course[]>([]);
    const [teachers, setTeachers] = useState<User[]>([]);
    const [students, setStudents] = useState<User[]>([]);

    const [courseForm, setCourseForm] = useState<CourseFormData>({
        courseId: '', name: '', teacherId: '', degreeLevel: 'bachelor', semester: '', studentIds: [],
    });
    const [courseSaving, setCourseSaving] = useState(false);
    const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

    const [assignmentForm, setAssignmentForm] = useState<AssignmentFormData>({
        id: '', title: '', description: '', dueDate: '',
        rubricText: '{"correctness":40,"codeStyle":20,"completeness":20,"explanation":20}',
    });
    const [assignmentSaving, setAssignmentSaving] = useState(false);
    const [assignmentCourseId, setAssignmentCourseId] = useState('');

    const fetchUsers = async () => {
        try {
            const response = await client.get<User[]>('/admin/users');
            setUsers(response.data);
        } catch (error: unknown) {
            if (isAxiosError(error)) {
              log?.error?.('admin-dashboard', 'Failed to fetch users', { message: error.message });
            } else {
              console.error('Failed to fetch users:', error);
            }
        }
    };

    const fetchRelations = async () => {
        try {
            setRelationLoading(true);
            setRelationError('');
            const response = await client.get<{ courses?: Course[]; teachers?: User[]; students?: User[] }>('/admin/relations/overview');
            setCourses(response.data?.courses ?? []);
            setTeachers(response.data?.teachers ?? []);
            setStudents(response.data?.students ?? []);
        } catch (error: unknown) {
            setRelationError(isAxiosError(error) ? (error.response?.data?.detail ?? 'Failed to load relation data') : 'Failed to load relation data');
        } finally {
            setRelationLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchRelations();
    }, []);

    const openAddModal = () => {
        setFormData({ id: '', username: '', email: '', password: '', role: 'teacher' });
        setModalState({ isOpen: true, isEditMode: false });
    };

    const openEditModal = (user: User) => {
        setFormData({ id: user.id, username: user.username, email: user.email, password: '', role: (user.role ?? 'student') as string });
        setModalState({ isOpen: true, isEditMode: true });
    };

    const closeModal = () => setModalState({ isOpen: false, isEditMode: false });

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const { id, username, email, role, password } = formData;
        try {
            if (modalState.isEditMode) {
                await client.put(`/admin/update_user/${id}`, { username, email, role, password });
            } else {
                await client.post('/admin/add_user', { username, email, role, password });
            }
            closeModal();
            fetchUsers();
        } catch (error: unknown) {
            toast.error(isAxiosError(error) ? (error.response?.data?.message ?? 'Operation failed') : 'Operation failed');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteUser = async (userId: string) => {
        setDeletingId(userId);
        try {
            await client.delete(`/admin/delete_user/${userId}`);
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err: unknown) {
            toast.error(isAxiosError(err) ? (err.response?.data?.message ?? 'Failed to delete user') : 'Failed to delete user');
        } finally {
            setDeletingId(null);
        }
    };

    const resetCourseForm = () => {
        setCourseForm({ courseId: '', name: '', teacherId: '', degreeLevel: 'bachelor', semester: '', studentIds: [] });
        setEditingCourseId(null);
    };

    const handleCourseSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCourseSaving(true);
        try {
            if (editingCourseId) {
                await client.put(`/admin/courses/${editingCourseId}`, courseForm);
            } else {
                await client.post('/admin/courses', courseForm);
            }
            resetCourseForm();
            fetchRelations();
        } catch (error: unknown) {
            toast.error(isAxiosError(error) ? (error.response?.data?.detail ?? 'Course save failed') : 'Course save failed');
        } finally {
            setCourseSaving(false);
        }
    };

    const handleEditCourse = (course: Course) => {
        setEditingCourseId(course.courseId ?? course.id ?? null);
        setCourseForm({
            courseId: (course.courseId ?? course.id ?? '') as string,
            name: course.name ?? '',
            teacherId: (course.teacherId ?? '') as string,
            degreeLevel: (course.degreeLevel ?? 'bachelor') as string,
            semester: (course.semester ?? '') as string,
            studentIds: ((course.studentList ?? []) as Array<{ studentId: string }>).map(s => s.studentId).filter(Boolean),
        });
    };

    const handleDeleteCourse = async (courseId: string) => {
        try {
            await client.delete(`/admin/courses/${courseId}`);
            fetchRelations();
            if (editingCourseId === courseId) resetCourseForm();
        } catch (error: unknown) {
            toast.error(isAxiosError(error) ? (error.response?.data?.detail ?? 'Delete course failed') : 'Delete course failed');
        }
    };

    const handleStudentToggle = (studentId: string) => {
        setCourseForm(prev => ({
            ...prev,
            studentIds: prev.studentIds.includes(studentId)
                ? prev.studentIds.filter(id => id !== studentId)
                : [...prev.studentIds, studentId]
        }));
    };

    const handleAssignmentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignmentCourseId) return toast.error('Please select course for assignment');
        let rubric: Record<string, number> = {};
        try {
            rubric = assignmentForm.rubricText.trim() ? JSON.parse(assignmentForm.rubricText) : {};
        } catch (_) {
            return toast.error('Rubric must be valid JSON');
        }

        setAssignmentSaving(true);
        try {
            await client.post(`/admin/courses/${assignmentCourseId}/assignments`, {
                id: assignmentForm.id,
                title: assignmentForm.title,
                description: assignmentForm.description,
                dueDate: assignmentForm.dueDate,
                rubric,
            });
            setAssignmentForm({ id: '', title: '', description: '', dueDate: '', rubricText: '{"correctness":40,"codeStyle":20,"completeness":20,"explanation":20}' });
            fetchRelations();
        } catch (error: unknown) {
            toast.error(isAxiosError(error) ? (error.response?.data?.detail ?? 'Create assignment failed') : 'Create assignment failed');
        } finally {
            setAssignmentSaving(false);
        }
    };

    const handleDeleteAssignment = async (courseId: string, assignmentId: string) => {
        try {
            await client.delete(`/admin/courses/${courseId}/assignments/${assignmentId}`);
            fetchRelations();
        } catch (error: unknown) {
            toast.error(isAxiosError(error) ? (error.response?.data?.detail ?? 'Delete assignment failed') : 'Delete assignment failed');
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