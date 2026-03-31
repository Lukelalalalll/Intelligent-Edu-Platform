import React from 'react';
import PropTypes from 'prop-types';
import BaseModal from '../../../components/BaseModal';
import styles from '../../../styles/AIInteract.module.css';

export default function ConfirmModal({ show, setModalConfig, confirmDelete }) {
    const close = () => setModalConfig({ show: false, sessionId: null });
    const iconClass = styles['modal-icon'];
    const titleClass = styles['modal-title'];
    const descClass = styles['modal-desc'];
    const actionsClass = styles['modal-actions'];
    const cancelBtnClass = `${styles['modal-btn']} ${styles['cancel-btn']}`;
    const confirmBtnClass = `${styles['modal-btn']} ${styles['confirm-btn']}`;

    return (
        <BaseModal open={show} onClose={close}>
            <div className={iconClass}><i className="fas fa-exclamation-triangle"></i></div>
            <h3 className={titleClass}>Delete Chat?</h3>
            <p className={descClass}>This action cannot be undone. All messages in this conversation will be permanently removed.</p>
            <div className={actionsClass}>
                <button className={cancelBtnClass} onClick={close}>Cancel</button>
                <button className={confirmBtnClass} onClick={confirmDelete}>Delete</button>
            </div>
        </BaseModal>
    );
}

ConfirmModal.propTypes = {
    show: PropTypes.bool,
    setModalConfig: PropTypes.func,
    confirmDelete: PropTypes.func,
};