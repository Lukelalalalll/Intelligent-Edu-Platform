import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/AdminDashboard.module.css';

export default function ConfirmModal({ confirmConfig, closeConfirm }) {
    return createPortal(
        <AnimatePresence>
            {confirmConfig.isOpen && (
                <motion.div 
                    className={`${styles.modalOverlay} ${styles.modalOverlayActive}`} 
                    onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div 
                        className={styles.modalContent}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                        <div className={styles.modalHeader}>
                            <h3>{confirmConfig.title}</h3>
                            <button className={styles.closeBtn} onClick={closeConfirm}>&times;</button>
                        </div>
                        <div style={{ marginBottom: '25px', color: '#555', fontSize: '1rem' }}>
                            {confirmConfig.text}
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.btnCancel} onClick={closeConfirm}>Cancel</button>
                            <button 
                                className={styles.btnSave} 
                                style={{ background: '#f43f5e', border: 'none', color: '#fff' }} 
                                onClick={() => { 
                                    if (confirmConfig.onConfirm) confirmConfig.onConfirm(); 
                                    closeConfirm(); 
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}