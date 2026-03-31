import React from 'react';
import BaseModal from '../../../components/BaseModal';
import styles from '../../../styles/AIInteract.module.css';

export default function ConfirmModal({ show, setModalConfig, confirmDelete }) {
    const close = () => setModalConfig({ show: false, sessionId: null });

    return (
        <BaseModal open={show} onClose={close}>
            <div className={styles['modal-icon']}><i className="fas fa-exclamation-triangle"></i></div>
            <h3 className={styles['modal-title']}>Delete Chat?</h3>
            <p className={styles['modal-desc']}>This action cannot be undone. All messages in this conversation will be permanently removed.</p>
            <div className={styles['modal-actions']}>
                <button className={`${styles['modal-btn']} ${styles['cancel-btn']}`} onClick={close}>Cancel</button>
                <button className={`${styles['modal-btn']} ${styles['confirm-btn']}`} onClick={confirmDelete}>Delete</button>
            </div>
        </BaseModal>
    );
}