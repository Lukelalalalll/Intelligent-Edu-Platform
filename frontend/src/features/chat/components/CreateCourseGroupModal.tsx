// frontend/src/features/chat/components/CreateCourseGroupModal.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/Modals.module.css';
import courseGroupStyles from '../styles/components/CourseGroupModal.module.css';
import { chatApi } from '../api';
import type { CourseInfo } from '../types';
import { useChatStore } from '../store/chatStore';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...sidebarStyles,
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
    ...modalStyles,
    ...courseGroupStyles,
};

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
            .then((r) => {
                // Deduplicate by course id (server may return duplicates)
                const seen = new Set<string>();
                const unique = r.courses.filter((c) => !seen.has(c.id) && seen.add(c.id));
                setCourses(unique);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleCreate = useCallback(async (course: CourseInfo) => {
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
    }, [setRooms, onEnterRoom, onClose]);

    const handleEnter = useCallback((roomId: string) => {
        onEnterRoom(roomId);
        onClose();
    }, [onEnterRoom, onClose]);

    return createPortal(
        <motion.div 
            className={styles.modalOverlay} 
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div 
                className={styles.modal} 
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>
                        <i className="fas fa-graduation-cap" style={{ marginRight: 8 }} />
                        Course Groups
                    </h3>
                    <button className={styles.modalClose} onClick={onClose}>
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
            </motion.div>
        </motion.div>,
        document.body
    );
}
