import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import styles from '../../styles/addChapterModal.module.css';

interface AddChapterModalProps {
    isOpen: boolean;
    busy: boolean;
    chapterName: string;
    chapterDescription: string;
    error: string;
    onClose: () => void;
    onChangeChapterName: (value: string) => void;
    onChangeChapterDescription: (value: string) => void;
    onCreate: () => void;
}

export default function AddChapterModal({
    isOpen,
    busy,
    chapterName,
    chapterDescription,
    error,
    onClose,
    onChangeChapterName,
    onChangeChapterDescription,
    onCreate,
}: AddChapterModalProps) {
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.modalOverlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !busy) {
                            onClose();
                        }
                    }}
                >
                    <motion.div
                        className={styles.modalContent}
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                        <div className={styles.modalHeader}>
                            <h3>Add New Chapter</h3>
                            {!busy && (
                                <button className={styles.closeBtn} onClick={onClose}>
                                    &times;
                                </button>
                            )}
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Chapter Name</label>
                            <input
                                className={styles.formInput}
                                value={chapterName}
                                onChange={(e) => onChangeChapterName(e.target.value)}
                                placeholder="e.g. Unit 3: Power Systems"
                                disabled={busy}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Description (Optional)</label>
                            <input
                                className={styles.formInput}
                                value={chapterDescription}
                                onChange={(e) => onChangeChapterDescription(e.target.value)}
                                placeholder="Brief summary of concepts covered"
                                disabled={busy}
                            />
                        </div>

                        {error && (
                            <p className={styles.modalErrorText}>
                                <i className="fas fa-exclamation-circle"></i> {error}
                            </p>
                        )}

                        <div className={styles.modalFooter}>
                            <button className={styles.btnCancel} onClick={onClose} disabled={busy}>
                                Cancel
                            </button>
                            <button
                                className={styles.btnSave}
                                disabled={busy || !chapterName.trim()}
                                onClick={onCreate}
                            >
                                {busy ? 'Saving...' : 'Add Chapter'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
