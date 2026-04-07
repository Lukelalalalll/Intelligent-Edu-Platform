// frontend/src/features/chat/components/CreateCourseGroupModal.tsx

import React, { useEffect, useState } from 'react';
import styles from '../styles/Chat.module.css';
import { chatApi } from '../../../api/chatApi';
import type { CourseInfo } from '../types';
import { useChatStore } from '../store/chatStore';

interface Props {
    onClose: () => void;
    onEnterRoom: (roomId: string) => void;
}

export default function CreateCourseGroupModal({ onClose, onEnterRoom }: Props) {
    const [courses, setCourses] = useState<CourseInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState<string | null>(null);
    const setRooms = useChatStore((s) => s.setRooms);

    useEffect(() => {
        chatApi.getCourseList()
            .then((r) => setCourses(r.courses))
            .finally(() => setLoading(false));
    }, []);

    const handleCreate = async (course: CourseInfo) => {
        setCreating(course.id);
        try {
            const res = await chatApi.createCourseGroup(course.id);
            // Refresh rooms
            const roomsRes = await chatApi.getRooms();
            setRooms(roomsRes.rooms);
            onEnterRoom(res.roomId);
            onClose();
        } catch {
            // ignore
        } finally {
            setCreating(null);
        }
    };

    const handleEnter = (roomId: string) => {
        onEnterRoom(roomId);
        onClose();
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>
                        <i className="fas fa-graduation-cap" style={{ marginRight: 8 }} />
                        Course Groups
                    </h3>
                    <button className={styles.modalCloseBtn} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {loading && (
                        <div className={styles.modalEmpty}>
                            <i className="fas fa-circle-notch fa-spin" /> Loading courses...
                        </div>
                    )}
                    {!loading && courses.length === 0 && (
                        <div className={styles.modalEmpty}>No courses found.</div>
                    )}
                    {courses.map((course) => (
                        <div key={course.id} className={styles.courseRow}>
                            <div className={styles.courseInfo}>
                                <i className="fas fa-book-open" style={{ marginRight: 8, opacity: 0.7 }} />
                                <span className={styles.courseName}>{course.name}</span>
                            </div>
                            {course.existingRoomId ? (
                                <button
                                    className={styles.courseEnterBtn}
                                    onClick={() => handleEnter(course.existingRoomId!)}
                                >
                                    <i className="fas fa-sign-in-alt" style={{ marginRight: 4 }} />
                                    Enter Group
                                </button>
                            ) : (
                                <button
                                    className={styles.courseCreateBtn}
                                    onClick={() => handleCreate(course)}
                                    disabled={creating === course.id}
                                >
                                    {creating === course.id
                                        ? <i className="fas fa-circle-notch fa-spin" />
                                        : <><i className="fas fa-plus" style={{ marginRight: 4 }} />Create Group</>}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
