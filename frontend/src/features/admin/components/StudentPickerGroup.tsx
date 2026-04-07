import React, { useState } from 'react';
import styles from '../styles/AdminDashboard.module.css';

interface Student {
    id: string;
    studentId?: string;
    username: string;
}

interface CourseForm {
    studentIds: string[];
    [key: string]: any;
}

interface StudentPickerGroupProps {
    students: Student[];
    courseForm: CourseForm;
    handleStudentToggle: (sid: string) => void;
}

export default function StudentPickerGroup({ students, courseForm, handleStudentToggle }: StudentPickerGroupProps) {
    const [manualId, setManualId] = useState('');

    const addManualStudent = () => {
        const sid = manualId.trim();
        if (!sid) return;
        if (!courseForm.studentIds.includes(sid)) {
            handleStudentToggle(sid);
        }
        setManualId('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
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
