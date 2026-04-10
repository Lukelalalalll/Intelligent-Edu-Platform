import React from 'react';
import styles from '../../../styles/sub2.module.css';

type Props = {
    file?: File | null;
    fileName?: string;
    fileType?: string;
    selectedPages: number[];
    goToStep1: () => void;
    goToStep3: () => void;
};

export default function DirectSourceMode({ file, fileName, fileType, selectedPages, goToStep1, goToStep3 }: Props) {
    return (
        <div className={styles.step2Wrapper}>
            <div className={styles.step2ScrollArea}>
                <div className={styles.stepTitle}>
                    <div className={styles.stepNumber}>2</div>
                    Prepare Source
                </div>

                <div className={styles.infoBox}>
                    <p style={{ marginTop: 0, marginBottom: 8 }}>
                        <strong>Direct PDF Generation is enabled.</strong>
                    </p>
                    <p style={{ margin: 0 }}>
                        Your uploaded file will be used as the generation source. You can skip extraction and proceed directly.
                    </p>
                </div>

                <div className={styles.directSourceSummary}>
                    <div><strong>File:</strong> {fileName || file?.name || 'N/A'}</div>
                    <div><strong>Type:</strong> {fileType || 'N/A'}</div>
                    <div>
                        <strong>Page Scope:</strong> {selectedPages.length > 0 ? `${selectedPages.length} selected page(s)` : 'All pages'}
                    </div>
                </div>
            </div>

            <div className={styles.step2BottomBar}>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={goToStep1}>
                    <i className="fas fa-arrow-left"></i> Back: Upload File
                </button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={goToStep3}>
                    Next: Generate Questions <i className="fas fa-arrow-right" style={{ marginLeft: '8px' }}></i>
                </button>
            </div>
        </div>
    );
}
