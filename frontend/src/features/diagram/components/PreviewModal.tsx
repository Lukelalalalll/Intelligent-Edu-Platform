import React from 'react';
import styles from '../styles/sub4.module.css';

export default function PreviewModal({ modalState, modalHandlers }) {
    return (
        <div className={`${styles.modalOverlay} ${modalState.isOpen ? styles.modalActive : ''}`} onClick={(e) => (e.target as HTMLElement).classList.contains(styles.modalOverlay) && modalHandlers.closeModal()}>
            <div className={styles.modalContent}>
                <button className={styles.modalClose} onClick={modalHandlers.closeModal}><i className="fas fa-times"></i></button>
                <div className={styles.modalPreview}>
                    {modalState.imgSrc ? <img src={modalState.imgSrc} alt="Preview" /> : null}
                </div>
                <div className={styles.modalActions}>
                    <h4>Diagram Preview</h4>
                    <p>High-resolution extracted diagram from your document. You can download it directly to your device.</p>
                    <button className="btn" onClick={modalHandlers.downloadImage} style={{ width: '100%' }}><i className="fas fa-download"></i> Download Image</button>
                </div>
            </div>
        </div>
    );
}