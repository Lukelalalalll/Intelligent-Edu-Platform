import React from 'react';
import styles from '../../../styles/AIInteract.module.css';

export default function ConfirmModal({ show, setModalConfig, confirmDelete }) {
    if (!show) return null;

    return (
        <div className={`${styles['custom-modal-overlay']} ${styles.show}`} onClick={(e) => {
            if (e.target.className.includes(styles['custom-modal-overlay'])) setModalConfig({ show: false, sessionId: null });
        }}>
            <div className={styles['custom-modal-box']}>
                <div className={styles['modal-icon']}><i className="fas fa-exclamation-triangle"></i></div>
                <h3 className={styles['modal-title']}>Delete Chat?</h3>
                <p className={styles['modal-desc']}>This action cannot be undone. All messages in this conversation will be permanently removed.</p>
                <div className={styles['modal-actions']}>
                    <button className={`${styles['modal-btn']} ${styles['cancel-btn']}`} onClick={() => setModalConfig({ show: false, sessionId: null })}>Cancel</button>
                    <button className={`${styles['modal-btn']} ${styles['confirm-btn']}`} onClick={confirmDelete}>Delete</button>
                </div>
            </div>
        </div>
    );
}