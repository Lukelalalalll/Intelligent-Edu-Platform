// MdProcessor.jsx
import React from 'react';
import '../../../styles/base.css';
import { useNavigate } from 'react-router-dom';

import styles from '../../../styles/sub1/md_processor.module.css';

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function MdProcessor({
    file, useLLM, isDragging, uploadStatus, uploadProgress, headers, selectedIndices, loading, errorMsg,
    fileInputRef, setUseLLM, handleDragOver, handleDragLeave, handleDrop, onFileChange, clearFile,
    handleUpload, handleCheckboxChange, combineSections,
    // Tab 2 props
    inputMode, setInputMode, textContent, setTextContent, textTitle, setTextTitle,
    cozeLoading, cozeError, textProcessing,
    handleCozeGenerate, handleProcessText,
}) {
    const navigate = useNavigate();
    const showUploadCard = headers.length === 0;
    const wordCount = textContent ? textContent.trim().split(/\s+/).filter(Boolean).length : 0;

    return (
        <div className="container">
            {/* Page Header */}
            <header className={`page-header ${styles.pageHeader}`}>
                <h1><i className="fas fa-file-alt" aria-hidden="true"></i> Markdown File Processor</h1>
                <p>Process and enhance your PDF and Markdown files with intelligent section extraction</p>
            </header>

            {/* Tab Switcher — only show when no headers parsed yet */}
            {showUploadCard && (
                <div className={styles.tabBar}>
                    <button
                        className={`${styles.tabBtn} ${inputMode === 'file' ? styles.tabBtnActive : ''}`}
                        onClick={() => setInputMode('file')}
                    >
                        <i className="fas fa-upload"></i> Upload File
                    </button>
                    <button
                        className={`${styles.tabBtn} ${inputMode === 'text' ? styles.tabBtnActive : ''}`}
                        onClick={() => setInputMode('text')}
                    >
                        <i className="fas fa-pen-fancy"></i> Write / Paste Text
                    </button>
                </div>
            )}

            {/* File Upload Section */}
            {showUploadCard && inputMode === 'file' && (
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
                                        aria-valuemin="0"
                                        aria-valuemax="100">
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
            )}

            {/* Text Input Tab */}
            {showUploadCard && inputMode === 'text' && (
                <section className={`card ${styles.card}`} aria-labelledby="text-title">
                    <div className={`card-body ${styles.cardBody}`}>
                        <h5 id="text-title" className="card-title">
                            <i className="fas fa-pen-fancy" aria-hidden="true"></i> Write or Generate Content
                        </h5>

                        {/* Coze AI Row */}
                        <div className={styles.cozeRow}>
                            <div className={styles.cozeInputGroup}>
                                <i className="fas fa-lightbulb"></i>
                                <input
                                    type="text"
                                    className={styles.cozeInput}
                                    placeholder="Enter topic or keywords (e.g. TCP/IP four-layer model)"
                                    value={textTitle}
                                    onChange={(e) => setTextTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !cozeLoading && handleCozeGenerate()}
                                />
                            </div>
                            <button
                                className={styles.cozeBtn}
                                onClick={handleCozeGenerate}
                                disabled={cozeLoading || !textTitle.trim()}
                            >
                                {cozeLoading ? (
                                    <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                                ) : (
                                    <><i className="fas fa-magic"></i> Generate with AI</>
                                )}
                            </button>
                        </div>

                        {cozeError && (
                            <div className={styles.cozeErrorMsg}>
                                <i className="fas fa-exclamation-circle"></i> {cozeError}
                            </div>
                        )}

                        {/* Content Textarea */}
                        <div className={styles.textareaWrapper}>
                            <textarea
                                className={styles.contentTextarea}
                                placeholder={"Write your content here using Markdown...\n\n## Section Title\n- Key point 1\n- Key point 2\n\n## Another Section\n- More content..."}
                                value={textContent}
                                onChange={(e) => setTextContent(e.target.value)}
                                rows={14}
                            />
                            <div className={styles.wordCountBar}>
                                <span>{wordCount} words</span>
                                {wordCount > 0 && wordCount < 50 && (
                                    <span className={styles.wordCountHint}>Tip: 100+ words recommended for good PPT content</span>
                                )}
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className={styles.textActionRow}>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary} ${styles.textProceedBtn}`}
                                onClick={() => handleProcessText('/sub1/highlighter')}
                                disabled={!textContent.trim() || textProcessing}
                            >
                                {textProcessing ? (
                                    <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                                ) : (
                                    <><i className="fas fa-highlighter"></i> Highlight &amp; Proceed</>
                                )}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {/* Headers List Section */}
            {!showUploadCard && (
                <section id="headersSection" className={`card ${styles.card}`} aria-labelledby="headers-title">
                    <div className={`card-body ${styles.cardBody}`}>
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h5 id="headers-title" className="card-title mb-0">
                                <i className="fas fa-list-ul" aria-hidden="true"></i> Select Required Sections
                            </h5>
                            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFile}>
                                <i className="fas fa-arrow-left"></i> Re-upload
                            </button>
                        </div>

                        <div id="fileInfo" className={`mb-3 ${styles.fileInfo}`}>
                            <div className={styles.fileInfoContent}>
                                <i className="fas fa-file-alt"></i>
                                <div className={styles.fileDetails}>
                                    <span id="fileName" className={styles.fileName}>{file?.name}</span>
                                    <span id="fileSize" className={styles.fileSize}>{file ? formatFileSize(file.size) : ''}</span>
                                </div>
                            </div>
                        </div>

                        <div id="headersList" className={`mt-4 ${styles.headersList}`} aria-live="polite">
                            {!file && headers.length === 0 && (
                                <div className={styles.emptyState}>
                                    <i className="fas fa-file-alt" aria-hidden="true"></i>
                                    <p>No file uploaded yet. Upload a file to see available sections.</p>
                                </div>
                            )}

                            {file && headers.length === 0 && uploadStatus === 'success' && (
                                <div className={`text-center py-4 ${styles.emptyState}`}>
                                    <i className="fas fa-info-circle mb-3" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
                                    <p className="text-muted">No headers found in the document.</p>
                                </div>
                            )}

                            {headers.length > 0 && (
                                <div className="headers-container">
                                    {headers.map(header => (
                                        <div key={header.index} className={`${styles.headerItem} ${styles['headerLevel' + header.level]}`}>
                                            <input
                                                type="checkbox"
                                                className="form-check-input me-2"
                                                value={header.index}
                                                id={`header-${header.index}`}
                                                checked={selectedIndices.includes(header.index)}
                                                onChange={() => handleCheckboxChange(header.index)}
                                            />
                                            <label className="form-check-label" htmlFor={`header-${header.index}`}>
                                                {header.text}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {headers.length > 0 && (
                            <div className={`mt-4 ${styles.actionButtons}`} id="actionButtons">
                                <button id="combineBtn" className={`btn btn-success ${styles.btn} ${styles.btnSuccess}`} onClick={() => combineSections('/sub1/highlighter')}>
                                    <i className="fas fa-file-export" aria-hidden="true"></i> Generate Combined File
                                </button>
                                <button id="highlightBtn" className={`btn btn-primary ${styles.btn} ${styles.btnPrimary}`} onClick={() => combineSections('/sub1/highlighter')}>
                                    <i className="fas fa-highlighter" aria-hidden="true"></i> Highlight & Proceed
                                </button>
                                <button id="quickProceedBtn" className="btn btn-secondary"
                                    onClick={() => navigate('/sub1/quick-process')}>
                                    <i className="fas fa-bolt"></i> Quick Proceed
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {loading && (
                <div className={styles.inlineLoadingHint} aria-live="polite">
                    <i className="fas fa-circle-notch fa-spin"></i> Processing your file, please wait...
                </div>
            )}

            {errorMsg && (
                <div id="errorAlert" className={`alert alert-danger mt-3 ${styles.alert} ${styles.alertDanger}`} role="alert" aria-live="polite">
                    {errorMsg}
                </div>
            )}
        </div>
    );
}