import React, { useMemo, useState } from 'react';
import styles from '../styles/AdminDashboard.module.css';
import StudentPickerGroup from './StudentPickerGroup';
import BaseModal from '../../../shared/BaseModal';

export default function RelationManagementPanel({
    relationSearch, setRelationSearch, relationLoading, relationError,
    courses, teachers, students, courseForm, setCourseForm, courseSaving,
    editingCourseId, resetCourseForm, handleCourseSubmit, handleEditCourse,
    handleDeleteCourse, handleStudentToggle
}) {
    const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);

    const filteredCourses = useMemo(() => {
        const query = relationSearch.toLowerCase().trim();
        if (!query) return courses;
        return courses.filter(c =>
            String(c.courseId || c.id || '').toLowerCase().includes(query) ||
            String(c.name || '').toLowerCase().includes(query) ||
            String(c.semester || '').toLowerCase().includes(query) ||
            String(c.degreeLevel || '').toLowerCase().includes(query)
        );
    }, [courses, relationSearch]);

    const onCourseSubmit = async (e) => {
        await handleCourseSubmit(e);
        setIsCourseModalOpen(false);
    };

    const onEditCourse = (course) => {
        handleEditCourse(course);
        setIsCourseModalOpen(true);
    };

    const onCloseModal = () => {
        setIsCourseModalOpen(false);
        resetCourseForm();
    };

    return (
        <>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <h2>Course Mapping</h2>
                    <p>Bind teacher, students, and materials to courses</p>
                </div>
                <div className={styles.headerActions} style={{ display: 'flex', gap: '12px' }}>
                    <div className={styles.searchWrapper}>
                        <i className={`fas fa-search ${styles.searchIcon}`}></i>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search course id/name..."
                            value={relationSearch}
                            onChange={(e) => setRelationSearch(e.target.value)}
                        />
                    </div>
                    <button 
                        className={styles.btnSave} 
                        style={{ margin: 0 }} 
                        onClick={() => { resetCourseForm(); setIsCourseModalOpen(true); }}
                    >
                        <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>
                        Create Course
                    </button>
                </div>
            </div>

            <BaseModal open={isCourseModalOpen} onClose={onCloseModal} width={550}>
                {/* 课程表单 */}
                <form onSubmit={onCourseSubmit} style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '1.25rem', color: '#1a1a1a', marginBottom: '16px', fontWeight: 700, textAlign: 'center' }}>
                        {editingCourseId ? 'Edit Course' : 'Create Course'}
                    </h3>
                    
                    <div className={styles.formGroup} style={{ textAlign: 'left' }}>
                        <label className={styles.formLabel}>Course ID</label>
                        <input className={styles.formInput} value={courseForm.courseId} disabled={!!editingCourseId} onChange={e => setCourseForm({ ...courseForm, courseId: e.target.value })} required />
                    </div>
                    <div className={styles.formGroup} style={{ textAlign: 'left' }}>
                        <label className={styles.formLabel}>Course Name</label>
                        <input className={styles.formInput} value={courseForm.name} onChange={e => setCourseForm({ ...courseForm, name: e.target.value })} required />
                    </div>
                    <div className={styles.formGroup} style={{ textAlign: 'left' }}>
                        <label className={styles.formLabel}>Teacher</label>
                        <div className={styles.formSelectWrapper}>
                            <select className={styles.formSelect} value={courseForm.teacherId} onChange={e => setCourseForm({ ...courseForm, teacherId: e.target.value })}>
                                <option value="">Unassigned</option>
                                {teachers.map(t => <option key={t.id} value={t.id}>{t.username} ({t.email})</option>)}
                            </select>
                        </div>
                    </div>
                    <div className={styles.formGroup} style={{ textAlign: 'left' }}>
                        <label className={styles.formLabel}>Degree Level</label>
                        <div className={styles.formSelectWrapper}>
                            <select className={styles.formSelect} value={courseForm.degreeLevel} onChange={e => setCourseForm({ ...courseForm, degreeLevel: e.target.value })}>
                                <option value="bachelor">Bachelor</option>
                                <option value="master">Master</option>
                                <option value="phd">PhD</option>
                            </select>
                        </div>
                    </div>
                    <div className={styles.formGroup} style={{ textAlign: 'left' }}>
                        <label className={styles.formLabel}>Semester</label>
                        <input className={styles.formInput} placeholder="e.g. 2026-Spring" value={courseForm.semester} onChange={e => setCourseForm({ ...courseForm, semester: e.target.value })} required />
                    </div>
                    
                    <div style={{ textAlign: 'left', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                        <StudentPickerGroup
                            students={students}
                            courseForm={courseForm}
                            handleStudentToggle={handleStudentToggle}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                        <button 
                            type="button" 
                            style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: '9999px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', background: '#f0f2f5', color: '#4B5563', transition: 'all 0.2s ease' }} 
                            onClick={onCloseModal}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: '9999px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', background: '#007b55', color: 'white', transition: 'all 0.2s ease', boxShadow: '0 4px 12px rgba(0, 123, 85, 0.2)' }} 
                            disabled={courseSaving}
                        >
                            {courseSaving ? 'Saving...' : (editingCourseId ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </BaseModal>

            {relationLoading && <div className={styles.relationHint}>Loading relation data...</div>}
            {relationError && <div className={styles.relationError} style={{color: 'red'}}>{relationError}</div>}

            <div className={styles.tableResponsive}>
                <table className={styles.customTable}>
                    <thead>
                        <tr>
                            <th>Course</th>
                            <th>Teacher</th>
                            <th>Degree</th>
                            <th>Semester</th>
                            <th>Students</th>
                            <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCourses.map(course => {
                            const cid = course.courseId || course.id;
                            const teacher = teachers.find(t => t.id === course.teacherId);
                            const studentsText = (course.studentList || []).map(s => s.studentId).join(', ') || '-';
                            return (
                                <tr key={cid}>
                                    <td><strong>{cid}</strong><br />{course.name}</td>
                                    <td>{teacher ? `${teacher.username}` : (course.teacherId || '-')}</td>
                                    <td>{course.degreeLevel || '-'}</td>
                                    <td>{course.semester || '-'}</td>
                                    <td>{studentsText}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div className={styles.actionCell}>
                                            <button className={`${styles.btnAction} ${styles.btnEdit}`} onClick={() => onEditCourse(course)}>
                                                <i className="fas fa-pen"></i>
                                            </button>
                                            <button className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => handleDeleteCourse(cid, course.name)}>
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}