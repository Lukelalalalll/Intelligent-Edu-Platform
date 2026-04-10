import React from 'react';
import { createPortal } from 'react-dom';
import styles from '../../../styles/sub2.module.css';

type Screenshot = { filename: string; dataUrl: string };

type Props = {
    open: boolean;
    closing: boolean;
    screenshots: Screenshot[];
    onClose: () => void;
    onDownloadAll: () => void;
    onDownloadSingle: (shot: Screenshot) => void;
    onRemove: (filename: string) => void;
};

export default function ScreenshotGalleryModal({
    open,
    closing,
    screenshots,
    onClose,
    onDownloadAll,
    onDownloadSingle,
    onRemove,
}: Props) {
    if (!open) return null;

    return createPortal(
        <div className={`${styles.galleryOverlay} ${closing ? styles.galleryOverlayClosing : ''}`} onClick={onClose}>
            <div className={`${styles.galleryModal} ${closing ? styles.galleryModalClosing : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className={styles.galleryHeader}>
                    <h3 style={{ margin: 0 }}><i className="fas fa-images" style={{ marginRight: '10px' }}></i>Screenshot Gallery</h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {screenshots.length > 1 && (
                            <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={onDownloadAll}>
                                <i className="fas fa-download"></i> Download All
                            </button>
                        )}
                        <button className={styles.galleryClose} onClick={onClose}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div className={styles.galleryGrid}>
                    {screenshots.map((shot) => (
                        <div key={shot.filename} className={styles.galleryCard}>
                            <div className={styles.galleryImgWrap}>
                                <img src={shot.dataUrl} alt={shot.filename} />
                            </div>
                            <div className={styles.galleryCardFooter}>
                                <span className={styles.galleryFilename} title={shot.filename}>{shot.filename}</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button className={styles.galleryBtn} onClick={() => onDownloadSingle(shot)} title="Download">
                                        <i className="fas fa-download"></i>
                                    </button>
                                    <button className={`${styles.galleryBtn} ${styles.galleryBtnDanger}`} onClick={() => onRemove(shot.filename)} title="Remove">
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {screenshots.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                        <i className="fas fa-camera" style={{ fontSize: '2rem', marginBottom: '10px', display: 'block' }}></i>
                        No screenshots captured yet.
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
