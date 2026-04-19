// MdProcessor.jsx
import React from 'react';
import '@/styles/base.css';
import WelcomeBanner from '../../../../shared/components/WelcomeBanner';

import styles from './styles/mdProcessor.module.css';
import FileUploadSection from './components/FileUploadSection';
import TextInputSection from './components/TextInputSection';

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function MdProcessor({
    file, useLLM, isDragging, uploadStatus, uploadProgress, headers, selectedIndices, loading, errorMsg,
    currentFilename,
    fileInputRef, setUseLLM, handleDragOver, handleDragLeave, handleDrop, onFileChange, clearFile,
    handleUpload, handleCheckboxChange, combineSections, proceedWithFullDoc,
    // Tab 2 props
    inputMode, setInputMode, textContent, setTextContent, textTitle, setTextTitle, seedContent, setSeedContent,
    cozeLoading, cozeError, textProcessing,
    provider, setProvider,
    handleCozeGenerate, handleProcessText,
    viewSwitchSlot,
    hideBanner,
}) {
    const showUploadCard = !currentFilename;
    const wordCount = textContent ? textContent.trim().split(/\s+/).filter(Boolean).length : 0;

    return (
        <div className={hideBanner ? undefined : "container"}>
            {!hideBanner && (
                <WelcomeBanner
                    title={<><i className="fas fa-file-alt" aria-hidden="true"></i> Markdown File Processor</>}
                    subtitle="Process and enhance your PDF and Markdown files with intelligent section extraction"
                    className={styles.pageHeader}
                    as="header"
                />
            )}

            {!hideBanner && viewSwitchSlot}

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
                <FileUploadSection
                    file={file}
                    useLLM={useLLM}
                    isDragging={isDragging}
                    uploadStatus={uploadStatus}
                    uploadProgress={uploadProgress}
                    fileInputRef={fileInputRef}
                    setUseLLM={setUseLLM}
                    handleDragOver={handleDragOver}
                    handleDragLeave={handleDragLeave}
                    handleDrop={handleDrop}
                    onFileChange={onFileChange}
                    clearFile={clearFile}
                    handleUpload={handleUpload}
                />
            )}

            {/* Text Input Tab */}
            {showUploadCard && inputMode === 'text' && (
                <TextInputSection
                    textContent={textContent}
                    setTextContent={setTextContent}
                    textTitle={textTitle}
                    setTextTitle={setTextTitle}
                    seedContent={seedContent}
                    setSeedContent={setSeedContent}
                    cozeLoading={cozeLoading}
                    cozeError={cozeError}
                    textProcessing={textProcessing}
                    provider={provider}
                    setProvider={setProvider}
                    handleCozeGenerate={handleCozeGenerate}
                    handleProcessText={handleProcessText}
                />
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

                            {file && headers.length === 0 && currentFilename && (
                                <div className={`text-center py-4 ${styles.emptyState}`}>
                                    <i className="fas fa-info-circle mb-3" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
                                    <p className="text-muted">No headers found in the document. You can proceed with the full document.</p>
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
                                <button id="combineBtn" className={`btn btn-success ${styles.btn} ${styles.btnSuccess}`} onClick={() => combineSections('/slides/highlighter')}>
                                    <i className="fas fa-file-export" aria-hidden="true"></i> Generate Combined File
                                </button>
                                <button id="highlightBtn" className={`btn btn-primary ${styles.btn} ${styles.btnPrimary}`} onClick={() => combineSections('/slides/highlighter')}>
                                    <i className="fas fa-highlighter" aria-hidden="true"></i> Highlight & Proceed
                                </button>
                                <button id="quickProceedBtn" className="btn btn-secondary"
                                    onClick={() => combineSections('/slides/quick-process')}>
                                    <i className="fas fa-bolt"></i> Quick Proceed
                                </button>
                            </div>
                        )}

                        {headers.length === 0 && currentFilename && (
                            <div className={`mt-4 ${styles.actionButtons}`} id="actionButtons">
                                <button className={`btn btn-primary ${styles.btn} ${styles.btnPrimary}`} onClick={() => proceedWithFullDoc('/slides/highlighter')}>
                                    <i className="fas fa-highlighter" aria-hidden="true"></i> Proceed with Full Document
                                </button>
                                <button className="btn btn-secondary"
                                    onClick={() => proceedWithFullDoc('/slides/quick-process')}>
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