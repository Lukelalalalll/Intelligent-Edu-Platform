import React from 'react';
import styles from '../styles/diagram.module.css';

export default function ExtractSection({ extractState, extractHandlers, modalHandlers }) {
    return (
        <div className="card">
            <div className="card-header">
                <div className="card-icon"><i className="fas fa-file-upload"></i></div>
                <h4>1. Extract from PDF/Word</h4>
            </div>
            <div className="card-content">
                <div
                    className={`${styles.uploadArea} ${extractState.isDragging ? styles.uploadAreaActive : ''}`}
                    onDragOver={extractHandlers.handleDragOver}
                    onDragLeave={extractHandlers.handleDragLeave}
                    onDrop={extractHandlers.handleDrop}
                >
                    <i className="fas fa-cloud-upload-alt"></i>
                    <p>Drag & drop your file here or click to browse</p>
                    <input type="file" accept=".pdf,.doc,.docx" className={styles.fileInput} onChange={extractHandlers.handleFileChange} />
                    {extractState.file && <p className={styles.fileName}>Selected: {extractState.file.name}</p>}
                </div>
                <button className="btn" onClick={extractHandlers.handleUpload} disabled={extractState.loading || !extractState.file}>
                    {extractState.loading ? <><i className="fas fa-spinner fa-spin"></i> Extracting...</> : <><i className="fas fa-cloud-upload-alt"></i> Upload & Extract</>}
                </button>

                {extractState.error && <p style={{ color: 'red', marginTop: '1rem' }}>{extractState.error}</p>}

                <div className={styles.resultsContainer}>
                    {extractState.data?.file && (
                        <div className={styles.fileInfo} style={{ gridColumn: '1 / -1' }}>
                            <p><strong>File:</strong> {extractState.data.file.original_name}</p>
                            <p><strong>Extracted:</strong> {extractState.data.file.extracted_count} diagrams</p>
                        </div>
                    )}
                    {extractState.data?.extracted?.length > 0 ? (
                        extractState.data.extracted.map((item, idx) => (
                            <div key={idx} className={styles.imgWrapper} onClick={() => modalHandlers.openModal(item.data, item.page)}>
                                <img src={item.data} alt={`Diagram page ${item.page}`} loading="lazy" />
                                <div className={styles.imgLabel}>Page {item.page}</div>
                            </div>
                        ))
                    ) : extractState.data && (
                        <div className={styles.emptyState}>No diagrams found in the document.</div>
                    )}
                </div>
            </div>
        </div>
    );
}