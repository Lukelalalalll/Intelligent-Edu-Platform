import React, { useMemo, useState } from 'react';
import styles from '../../../styles/AdminDashboard.module.css';

export default function RelationManagementPanel({
    relationSearch, setRelationSearch, relationLoading, relationError,
    courses, teachers, students, courseForm, setCourseForm, courseSaving,
    editingCourseId, resetCourseForm, handleCourseSubmit, handleEditCourse,
    handleDeleteCourse, handleStudentToggle, assignmentForm, setAssignmentForm,
    assignmentSaving, assignmentCourseId, setAssignmentCourseId,
    handleAssignmentSubmit, handleDeleteAssignment
}) {
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

    return (
        <>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <h2>Course Mapping</h2>
                    <p>Bind teacher, students, and assignments to course</p>
                </div>
                <div className={styles.headerActions}>
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
                </div>
            </div>

            <div className={styles.relationGrid}>
                {/* 课程表单 */}
                <form className={styles.dashboardCardInner} onSubmit={handleCourseSubmit}>
                    <h3>{editingCourseId ? 'Edit Course' : 'Create Course'}</h3>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Course ID</label>
                        <input className={styles.formInput} value={courseForm.courseId} disabled={!!editingCourseId} onChange={e => setCourseForm({ ...courseForm, courseId: e.target.value })} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Course Name</label>
                        <input className={styles.formInput} value={courseForm.name} onChange={e => setCourseForm({ ...courseForm, name: e.target.value })} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Teacher</label>
                        <div className={styles.formSelectWrapper}>
                            <select className={styles.formSelect} value={courseForm.teacherId} onChange={e => setCourseForm({ ...courseForm, teacherId: e.target.value })}>
                                <option value="">Unassigned</option>
                                {teachers.map(t => <option key={t.id} value={t.id}>{t.username} ({t.email})</option>)}
                            </select>
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Degree Level</label>
                        <div className={styles.formSelectWrapper}>
                            <select className={styles.formSelect} value={courseForm.degreeLevel} onChange={e => setCourseForm({ ...courseForm, degreeLevel: e.target.value })}>
                                <option value="bachelor">Bachelor</option>
                                <option value="master">Master</option>
                                <option value="phd">PhD</option>
                            </select>
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Semester</label>
                        <input className={styles.formInput} placeholder="e.g. 2026-Spring" value={courseForm.semester} onChange={e => setCourseForm({ ...courseForm, semester: e.target.value })} required />
                    </div>
                    <StudentPickerGroup
                        students={students}
                        courseForm={courseForm}
                        handleStudentToggle={handleStudentToggle}
                    />
                    <div className={styles.modalFooter}>
                        <button type="button" className={styles.btnCancel} onClick={resetCourseForm}>Reset</button>
                        <button type="submit" className={styles.btnSave} disabled={courseSaving}>{courseSaving ? 'Saving...' : (editingCourseId ? 'Update Course' : 'Create Course')}</button>
                    </div>
                </form>

                {/* 作业表单 */}
                <form className={styles.dashboardCardInner} onSubmit={handleAssignmentSubmit}>
                    <h3>Create Assignment</h3>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Course</label>
                        <div className={styles.formSelectWrapper}>
                            <select className={styles.formSelect} value={assignmentCourseId} onChange={e => setAssignmentCourseId(e.target.value)} required>
                                <option value="">Select Course</option>
                                {courses.map(c => <option key={c.courseId || c.id} value={c.courseId || c.id}>{c.courseId || c.id} - {c.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Assignment ID</label>
                        <input className={styles.formInput} value={assignmentForm.id} onChange={e => setAssignmentForm({ ...assignmentForm, id: e.target.value })} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Title</label>
                        <input className={styles.formInput} value={assignmentForm.title} onChange={e => setAssignmentForm({ ...assignmentForm, title: e.target.value })} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Description</label>
                        <textarea className={styles.formInput} rows={3} value={assignmentForm.description} onChange={e => setAssignmentForm({ ...assignmentForm, description: e.target.value })} />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Due Date</label>
                        <input className={styles.formInput} value={assignmentForm.dueDate} onChange={e => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })} placeholder="YYYY-MM-DD" />
                    </div>
                    <div className={styles.modalFooter}>
                        <button type="submit" className={styles.btnSave} disabled={assignmentSaving}>{assignmentSaving ? 'Saving...' : 'Create Assignment'}</button>
                    </div>
                </form>
            </div>

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
                            <th>Assignments</th>
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
                                    <td>
                                        {(course.assignments || []).length === 0 ? '-' : (
                                            <div className={styles.assignmentList}>
                                                {(course.assignments || []).map(a => (
                                                    <div key={a.id} className={styles.assignmentItem}>
                                                        <span>{a.id}: {a.title}</span>
                                                        <button type="button" className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => handleDeleteAssignment(cid, a.id)}>
                                                            <i className="fas fa-trash-alt"></i>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div className={styles.actionCell}>
                                            <button className={`${styles.btnAction} ${styles.btnEdit}`} onClick={() => handleEditCourse(course)}>
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

function StudentPickerGroup({ students, courseForm, handleStudentToggle }) {
    const [manualId, setManualId] = useState('');

    const addManualStudent = () => {
        const sid = manualId.trim();
        if (!sid) return;
        if (!courseForm.studentIds.includes(sid)) {
            handleStudentToggle(sid); // adds it (since it's not in the list yet)
        }
        setManualId('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addManualStudent();
        }
    };

    return (
        <div className={styles.formGroup}>
            <label className={styles.formLabel}>Students</label>
            {students.length > 0 ? (
                <div className={styles.studentPickList}>
                    {students.map(s => {
                        const sid = s.studentId || s.id;
                        const selected = courseForm.studentIds.includes(sid);
                        return (
                            <button
                                type="button"
                                key={s.id}
                                className={`${styles.studentChip} ${selected ? styles.studentChipActive : ''}`}
                                onClick={() => handleStudentToggle(sid)}
                            >
                                {s.username}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p style={{ color: '#999', fontSize: '0.85rem', margin: '4px 0 8px' }}>
                    No student users found. Use the input below to add by Student ID, or create student accounts in User Management first.
                </p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                    className={styles.formInput}
                    placeholder="Enter Student ID manually"
                    value={manualId}
                    onChange={e => setManualId(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{ flex: 1 }}
                />
                <button
                    type="button"
                    className={styles.btnSave}
                    onClick={addManualStudent}
                    style={{ whiteSpace: 'nowrap', padding: '6px 14px' }}
                >
                    + Add
                </button>
            </div>
            {courseForm.studentIds.length > 0 && (
                <div className={styles.studentPickList} style={{ marginTop: '8px' }}>
                    {courseForm.studentIds.map(sid => {
                        const knownStudent = students.find(s => (s.studentId || s.id) === sid);
                        return (
                            <button
                                type="button"
                                key={sid}
                                className={`${styles.studentChip} ${styles.studentChipActive}`}
                                onClick={() => handleStudentToggle(sid)}
                                title="Click to remove"
                            >
                                {knownStudent ? knownStudent.username : sid} ×
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}