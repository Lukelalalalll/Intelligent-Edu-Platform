import React from 'react';
import { createPortal } from 'react-dom';
import styles from '../../../styles/AdminDashboard.module.css';

export default function ConfirmModal({ confirmConfig, closeConfirm }) {
    if (!confirmConfig.isOpen) return null;

    return createPortal(
        <div 
            className={`${styles.modalOverlay} ${styles.modalOverlayActive}`} 
            onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}
        >
            <div className={styles.modalContent}>
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
            </div>
        </div>,
        document.body
    );
}