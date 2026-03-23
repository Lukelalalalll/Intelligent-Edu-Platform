import React from 'react';
import styles from '../../../styles/sub4/sub4.module.css';

export default function GenSection({ genState, genHandlers }) {
    return (
        <div className="card">
            <div className="card-header">
                <div className="card-icon"><i className="fas fa-robot"></i></div>
                <h4>3. AI Generate</h4>
            </div>
            <div className="card-content">
                <div
                    className={`${styles.uploadArea} ${genState.isDragging ? styles.uploadAreaActive : ''}`}
                    onDragOver={genHandlers.handleDragOver}
                    onDragLeave={genHandlers.handleDragLeave}
                    onDrop={genHandlers.handleDrop}
                >
                    <i className="fas fa-file-alt"></i>
                    <p>Upload a text file for AI generation</p>
                    <input type="file" accept=".txt" className={styles.fileInput} onChange={genHandlers.handleFileChange} />
                    {genState.file && <p className={styles.fileName}>Selected: {genState.file.name}</p>}
                </div>
                <button className="btn" onClick={genHandlers.handleGenerate} disabled={genState.loading || !genState.file}>
                    {genState.loading ? <><i className="fas fa-spinner fa-spin"></i> Generating...</> : <><i className="fas fa-magic"></i> Generate</>}
                </button>

                {genState.error && <p style={{ color: 'red', marginTop: '1rem' }}>{genState.error}</p>}

                {genState.data && (
                    <div className={styles.generatedResult} style={{ marginTop: '2rem' }}>
                        <h3>Generated Diagram</h3>
                        {genState.data.pdf_base64 ? (
                            <iframe src={`data:application/pdf;base64,${genState.data.pdf_base64}`} width="100%" height="500px" style={{ border: '1px solid #ccc', borderRadius: '8px' }}></iframe>
                        ) : (
                            <>
                                <iframe src={genState.data.pdf_url} width="100%" height="500px" style={{ border: '1px solid #ccc', borderRadius: '8px' }}></iframe>
                                <a href={genState.data.pdf_url} target="_blank" rel="noreferrer" className="btn" style={{ marginTop: '10px' }}><i className="fas fa-download"></i> Download PDF</a>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}