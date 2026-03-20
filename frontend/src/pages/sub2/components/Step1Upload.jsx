// frontend/src/pages/sub2/components/Step1Upload.jsx
import React from 'react';
import styles from '../../../styles/sub2/sub2.module.css';

export default function Step1Upload({ states, handlers }) {
    const { file, fileName, fileType, totalPages, selectedPages, uploadLoading, isDragging } = states;
    const { handleDragOver, handleDragLeave, handleDrop, handleFileChange, selectAllPages, clearPageSelection, togglePage } = handlers;

    return (
        <div className={styles.stepContainer}>
            <div className={styles.stepTitle}>
                <div className={styles.stepNumber}>1</div>
                Upload File
            </div>

            <div
                className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('fileInput').click()}
            >
                <div className={styles.uploadIcon}><i className="fas fa-file-upload"></i></div>
                <h3>Drag and drop files here or click to select</h3>
                <p>Supports PDF, PNG, JPG formats</p>
                <input
                    type="file"
                    id="fileInput"
                    className={styles.fileInput}
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
                <button className={`${styles.btn} ${styles.btnSecondary}`} style={{ marginTop: '15px' }} onClick={(e) => { e.stopPropagation(); document.getElementById('fileInput').click(); }}>
                    <i className="fas fa-folder-open"></i> Choose File
                </button>
            </div>

            {uploadLoading && (
                <div className={styles.loadingWrapper}>
                    <i className="fas fa-spinner fa-spin fa-2x"></i>
                    <p style={{ marginTop: '10px' }}>Uploading...</p>
                </div>
            )}

            {file && !uploadLoading && (
                <div className={styles.infoBox} style={{ marginTop: '20px' }}>
                    <strong><i className="fas fa-check-circle"></i> File uploaded successfully: </strong> {fileName}

                    {fileType === 'pdf' && (
                        <div style={{ marginTop: '20px', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                            <h5 style={{ color: '#333', marginBottom: '15px' }}>Select pages to extract:</h5>
                            <div className={styles.pageSelectorButtons}>
                                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={selectAllPages}>
                                    <i className="fas fa-check-double"></i> Select All
                                </button>
                                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={clearPageSelection}>
                                    <i className="fas fa-trash-alt"></i> Clear
                                </button>
                            </div>
                            <div className={styles.pagesGrid}>
                                {Array.from({ length: totalPages }, (_, i) => (
                                    <div
                                        key={i}
                                        className={`${styles.pageItem} ${selectedPages.includes(i) ? styles.pageItemSelected : ''}`}
                                        onClick={() => togglePage(i)}
                                    >
                                        {i + 1}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}