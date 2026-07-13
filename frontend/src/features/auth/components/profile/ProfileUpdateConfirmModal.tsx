import styles from '../../styles/profile.module.css';
import type { ProfileTranslator } from './types';

interface ProfileUpdateConfirmModalProps {
    open: boolean;
    t: ProfileTranslator;
    onClose: () => void;
    onConfirm: () => void;
}

export function ProfileUpdateConfirmModal({ open, t, onClose, onConfirm }: ProfileUpdateConfirmModalProps) {
    if (!open) {
        return null;
    }

    return (
        <div
            className={`${styles.modalOverlay} ${styles.active}`}
            onClick={(event) => {
                if (event.target instanceof HTMLElement && event.target.classList.contains('modal-overlay')) {
                    onClose();
                }
            }}
        >
            <div className={styles.modalBox}>
                <div className={styles.modalIcon}><i className="fas fa-exclamation-triangle"></i></div>
                <h3>{t('profile.confirmTitle')}</h3>
                <p>{t('profile.confirmBody')}</p>
                <div className={styles.modalActions}>
                    <button className={`${styles.btnModal} ${styles.btnCancel}`} onClick={onClose}>{t('profile.cancel')}</button>
                    <button className={`${styles.btnModal} ${styles.btnConfirm}`} onClick={onConfirm}>{t('profile.confirmUpdate')}</button>
                </div>
            </div>
        </div>
    );
}
