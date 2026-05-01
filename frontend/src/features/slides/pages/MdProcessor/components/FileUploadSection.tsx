import React from 'react';
import styles from '../styles/mdProcessor.module.css';

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface FileUploadSectionProps {
    file: File | null;
    useLLM: boolean;
    headerLlmProvider: 'local_ollama' | 'coze';
    isDragging: boolean;
    uploadStatus: string;
    uploadProgress: number;
    fileInputRef: React.RefObject<HTMLInputElement>;
    setUseLLM: (v: boolean) => void;
    setHeaderLlmProvider: (v: 'local_ollama' | 'coze') => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: () => void;
    handleDrop: (e: React.DragEvent) => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    clearFile: () => void;
    handleUpload: (e: React.FormEvent) => void;
}

export default function FileUploadSection({
    file, useLLM, headerLlmProvider, isDragging, uploadStatus, uploadProgress,
    fileInputRef, setUseLLM, setHeaderLlmProvider, handleDragOver, handleDragLeave, handleDrop,
    onFileChange, clearFile, handleUpload,
}: FileUploadSectionProps) {
    return (
        <section className={`card ${styles.card}`} aria-labelledby="upload-title">
            <div className={`card-body ${styles.cardBody}`}>
                <h5 id="upload-title" className="card-title">
                    <i className="fas fa-upload" aria-hidden="true"></i> Upload File
                </h5>

                <div id="fileInfo" className={`mb-3 ${styles.fileInfo}`} style={{ display: file ? 'block' : 'none' }}>
                    <div className={styles.fileInfoContent}>
                        <i className="fas fa-file-alt"></i>
                        <div className={styles.fileDetails}>
                            <span id="fileName" className={styles.fileName}>{file?.name}</span>
                            <span id="fileSize" className={styles.fileSize}>{file ? formatFileSize(file.size) : ''}</span>
                        </div>
                        <button type="button" id="clearFileBtn" className={`btn btn-sm btn-outline-danger ${styles.clearFileBtn}`} onClick={clearFile}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    {(uploadStatus === 'start' || uploadStatus === 'success') && (
                        <div id="uploadProgress" className="progress mt-2" style={{ display: 'flex', height: '6px' }}>
                            <div id="uploadProgressBar"
                                className="progress-bar progress-bar-striped progress-bar-animated"
                                role="progressbar"
                                style={{
                                    width: `${uploadProgress}%`,
                                    background: uploadStatus === 'success' ? 'linear-gradient(90deg, #4CAF50, #45a049)' : ''
                                }}
                                aria-valuenow={uploadProgress}
                                aria-valuemin={0}
                                aria-valuemax={100}>
                            </div>
                        </div>
                    )}
                </div>

                <form id="uploadForm" className="mt-4" onSubmit={handleUpload}>
                    <div className="mb-4">
                        <div className={styles.fileInputContainer}>
                            <input
                                type="file"
                                className={`form-control ${styles.fileInput}`}
                                id="fileInput"
                                accept=".pdf,.md"
                                onChange={onFileChange}
                                ref={fileInputRef}
                            />
                            <div
                                className={`${styles.fileDropArea} ${isDragging ? styles.active : ''}`}
                                id="fileDropArea"
                                onDragOver={handleDragOver}
                                onDragEnter={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <i className="fas fa-cloud-upload-alt" aria-hidden="true"></i>
                                <p>Drag & drop your file here or click to browse</p>
                                <span className={styles.fileTypes}>Supports PDF and Markdown files (Max: 10MB)</span>
                            </div>
                        </div>
                    </div>
                    <div className={`mb-4 form-check ${styles.formCheck}`}>
                        <input
                            type="checkbox"
                            className={`form-check-input ${styles.formCheckInput}`}
                            id="useLLMCheckbox"
                            checked={useLLM}
                            onChange={(e) => setUseLLM(e.target.checked)}
                        />
                        <label className={`form-check-label ${styles.formCheckLabel}`} htmlFor="useLLMCheckbox">
                            <i className="fas fa-robot" aria-hidden="true"></i> Fetch enhanced headers using LLM
                        </label>
                    </div>
                    {useLLM && (
                        <div className={`mb-4 ${styles.providerSelector}`}>
                            <span className={styles.providerLabel}>LLM Provider</span>
                            <div className={styles.providerPills}>
                                <button
                                    type="button"
                                    className={`${styles.providerPill} ${headerLlmProvider === 'local_ollama' ? styles.providerPillActive : ''}`}
                                    onClick={() => setHeaderLlmProvider('local_ollama')}
                                >
                                    <i className="fas fa-server" aria-hidden="true"></i> Local Llama
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.providerPill} ${headerLlmProvider === 'coze' ? styles.providerPillActive : ''}`}
                                    onClick={() => setHeaderLlmProvider('coze')}
                                >
                                    <i className="fas fa-cloud" aria-hidden="true"></i> Coze
                                </button>
                            </div>
                        </div>
                    )}
                    <button
                        type="submit"
                        className={`btn btn-primary ${styles.btn} ${styles.btnPrimary} ${uploadStatus === 'start' ? styles.processing : ''}`}
                        id="uploadBtn"
                        disabled={!file || uploadStatus === 'start'}
                    >
                        <i className="fas fa-cloud-upload-alt" aria-hidden="true"></i> Process
                    </button>
                </form>
            </div>
        </section>
    );
}
