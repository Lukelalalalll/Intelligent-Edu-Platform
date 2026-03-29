// import React, { useState, useEffect } from 'react';
// import client from '../api/client';
// import AdminDashboard from '../pages/AdminBoard/index';
// import { log } from '../utils/logger';

// export default function AdminDashboardEntry() {
//     const [activeMode, setActiveMode] = useState('users');

//     const [users, setUsers] = useState([]);
//     const [searchQuery, setSearchQuery] = useState('');
//     const [modalState, setModalState] = useState({ isOpen: false, isEditMode: false });
//     const [formData, setFormData] = useState({ id: '', username: '', email: '', password: '', role: 'teacher' });
//     const [isSaving, setIsSaving] = useState(false);
//     const [deletingId, setDeletingId] = useState(null);

//     const [relationSearch, setRelationSearch] = useState('');
//     const [relationLoading, setRelationLoading] = useState(false);
//     const [relationError, setRelationError] = useState('');
//     const [courses, setCourses] = useState([]);
//     const [teachers, setTeachers] = useState([]);
//     const [students, setStudents] = useState([]);

//     const [courseForm, setCourseForm] = useState({
//         courseId: '',
//         name: '',
//         teacherId: '',
//         degreeLevel: 'bachelor',
//         semester: '',
//         studentIds: [],
//     });
//     const [courseSaving, setCourseSaving] = useState(false);
//     const [editingCourseId, setEditingCourseId] = useState(null);

//     const [assignmentForm, setAssignmentForm] = useState({
//         id: '',
//         title: '',
//         description: '',
//         dueDate: '',
//         rubricText: '{"correctness":40,"codeStyle":20,"completeness":20,"explanation":20}',
//     });
//     const [assignmentSaving, setAssignmentSaving] = useState(false);
//     const [assignmentCourseId, setAssignmentCourseId] = useState('');

//     // 从 localStorage 获取当前管理员的 ID，防止他删掉自己
//     const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
//     const currentUserId = currentUser.id;

//     // 1. 获取所有用户列表
//     const fetchUsers = async () => {
//         try {
//             // 使用封装好的 client，它会自动带上 JWT Cookie，不需要写 header
//             const response = await client.get('/admin/users');
//             setUsers(response.data);
//         } catch (error) {
//             log.error('admin-dashboard', 'Failed to fetch users', { message: error?.message });
//             // 如果后端返回 403 没权限，可以考虑跳转回首页
//         }
//     };

//     useEffect(() => {
//         fetchUsers();
//         fetchRelations();
//     }, []);

//     const fetchRelations = async () => {
//         try {
//             setRelationLoading(true);
//             setRelationError('');
//             const response = await client.get('/admin/relations/overview');
//             setCourses(response.data?.courses || []);
//             setTeachers(response.data?.teachers || []);
//             setStudents(response.data?.students || []);
//         } catch (error) {
//             setRelationError(error.response?.data?.detail || 'Failed to load relation data');
//         } finally {
//             setRelationLoading(false);
//         }
//     };

//     // 2. 模态框操作
//     const openAddModal = () => {
//         setFormData({ id: '', username: '', email: '', password: '', role: 'teacher' });
//         setModalState({ isOpen: true, isEditMode: false });
//     };

//     const openEditModal = (user) => {
//         setFormData({
//             id: user.id,
//             username: user.username,
//             email: user.email,
//             password: '',
//             role: user.role || 'student'
//         });
//         setModalState({ isOpen: true, isEditMode: true });
//     };

//     const closeModal = () => {
//         setModalState({ isOpen: false, isEditMode: false });
//     };

//     const resetCourseForm = () => {
//         setCourseForm({
//             courseId: '',
//             name: '',
//             teacherId: '',
//             degreeLevel: 'bachelor',
//             semester: '',
//             studentIds: [],
//         });
//         setEditingCourseId(null);
//     };

//     // 3. 表单提交 (新增 / 更新)
//     const handleFormSubmit = async (e) => {
//         e.preventDefault();
//         setIsSaving(true);

//         const { id, username, email, role, password } = formData;
//         const payload = { username, email, role, password };

//         try {
//             if (modalState.isEditMode) {
//                 await client.put(`/admin/update_user/${id}`, payload);
//             } else {
//                 await client.post(`/admin/add_user`, payload);
//             }
//             closeModal();
//             fetchUsers(); // 提交成功后重新拉取列表
//         } catch (error) {
//             alert('Error: ' + (error.response?.data?.message || 'Operation failed'));
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     // 4. 删除用户
//     const deleteUser = async (userId, username) => {
        

//         setDeletingId(userId);
//         try {
//             await client.delete(`/admin/delete_user/${userId}`);
//             setUsers(prev => prev.filter(u => u.id !== userId)); // 本地直接移除，不用重新拉取
//         } catch (err) {
//             alert('Failed to delete user: ' + (err.response?.data?.message || 'Network error'));
//         } finally {
//             setDeletingId(null);
//         }
//     };

//     const handleCourseSubmit = async (e) => {
//         e.preventDefault();
//         setCourseSaving(true);
//         try {
//             if (editingCourseId) {
//                 await client.put(`/admin/courses/${editingCourseId}`, courseForm);
//             } else {
//                 await client.post('/admin/courses', courseForm);
//             }
//             resetCourseForm();
//             fetchRelations();
//         } catch (error) {
//             alert(error.response?.data?.detail || 'Course save failed');
//         } finally {
//             setCourseSaving(false);
//         }
//     };

//     const handleEditCourse = (course) => {
//         setEditingCourseId(course.courseId || course.id);
//         setCourseForm({
//             courseId: course.courseId || course.id || '',
//             name: course.name || '',
//             teacherId: course.teacherId || '',
//             degreeLevel: course.degreeLevel || 'bachelor',
//             semester: course.semester || '',
//             studentIds: (course.studentList || []).map(s => s.studentId).filter(Boolean),
//         });
//     };

//     const handleDeleteCourse = async (courseId, name) => {
        
//         try {
//             await client.delete(`/admin/courses/${courseId}`);
//             fetchRelations();
//             if (editingCourseId === courseId) resetCourseForm();
//         } catch (error) {
//             alert(error.response?.data?.detail || 'Delete course failed');
//         }
//     };

//     const handleStudentToggle = (studentId) => {
//         setCourseForm(prev => {
//             const exists = prev.studentIds.includes(studentId);
//             if (exists) {
//                 return { ...prev, studentIds: prev.studentIds.filter(id => id !== studentId) };
//             }
//             return { ...prev, studentIds: [...prev.studentIds, studentId] };
//         });
//     };

//     const handleAssignmentSubmit = async (e) => {
//         e.preventDefault();
//         if (!assignmentCourseId) {
//             alert('Please select course for assignment');
//             return;
//         }
//         let rubric = {};
//         try {
//             rubric = assignmentForm.rubricText.trim() ? JSON.parse(assignmentForm.rubricText) : {};
//         } catch (_) {
//             alert('Rubric must be valid JSON');
//             return;
//         }

//         setAssignmentSaving(true);
//         try {
//             await client.post(`/admin/courses/${assignmentCourseId}/assignments`, {
//                 id: assignmentForm.id,
//                 title: assignmentForm.title,
//                 description: assignmentForm.description,
//                 dueDate: assignmentForm.dueDate,
//                 rubric,
//             });
//             setAssignmentForm({
//                 id: '',
//                 title: '',
//                 description: '',
//                 dueDate: '',
//                 rubricText: '{"correctness":40,"codeStyle":20,"completeness":20,"explanation":20}',
//             });
//             fetchRelations();
//         } catch (error) {
//             alert(error.response?.data?.detail || 'Create assignment failed');
//         } finally {
//             setAssignmentSaving(false);
//         }
//     };

//     const handleDeleteAssignment = async (courseId, assignmentId) => {
        
//         try {
//             await client.delete(`/admin/courses/${courseId}/assignments/${assignmentId}`);
//             fetchRelations();
//         } catch (error) {
//             alert(error.response?.data?.detail || 'Delete assignment failed');
//         }
//     };

//     return (
//         <AdminDashboard
//             activeMode={activeMode}
//             setActiveMode={setActiveMode}
//             users={users}
//             currentUserId={currentUserId}
//             searchQuery={searchQuery}
//             setSearchQuery={setSearchQuery}
//             modalState={modalState}
//             formData={formData}
//             setFormData={setFormData}
//             isSaving={isSaving}
//             deletingId={deletingId}
//             openAddModal={openAddModal}
//             openEditModal={openEditModal}
//             closeModal={closeModal}
//             handleFormSubmit={handleFormSubmit}
//             deleteUser={deleteUser}

//             relationSearch={relationSearch}
//             setRelationSearch={setRelationSearch}
//             relationLoading={relationLoading}
//             relationError={relationError}
//             courses={courses}
//             teachers={teachers}
//             students={students}
//             courseForm={courseForm}
//             setCourseForm={setCourseForm}
//             courseSaving={courseSaving}
//             editingCourseId={editingCourseId}
//             resetCourseForm={resetCourseForm}
//             handleCourseSubmit={handleCourseSubmit}
//             handleEditCourse={handleEditCourse}
//             handleDeleteCourse={handleDeleteCourse}
//             handleStudentToggle={handleStudentToggle}
//             assignmentForm={assignmentForm}
//             setAssignmentForm={setAssignmentForm}
//             assignmentSaving={assignmentSaving}
//             assignmentCourseId={assignmentCourseId}
//             setAssignmentCourseId={setAssignmentCourseId}
//             handleAssignmentSubmit={handleAssignmentSubmit}
//             handleDeleteAssignment={handleDeleteAssignment}
//         />
//     );
// }






import React, { useState, useEffect } from 'react';
import client from '../api/client';
import AdminDashboard from '../pages/AdminBoard/index';

// 假设你有一个日志工具，如果没有可以删掉或者留个 console.error
import { log } from '../utils/logger'; 

export default function AdminDashboardEntry() {
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
            // 基础状态
            activeMode={activeMode} setActiveMode={setActiveMode} currentUserId={currentUserId}
            
            // 将 Users 相关的全部平铺传入（或者你可以选择继续打包，这里保持平铺配合你的 Page 接收）
            users={users} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            modalState={modalState} formData={formData} setFormData={setFormData}
            isSaving={isSaving} deletingId={deletingId}
            openAddModal={openAddModal} openEditModal={openEditModal} closeModal={closeModal}
            handleFormSubmit={handleFormSubmit} deleteUser={deleteUser}

            // 将 Relations 相关的全部平铺传入
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