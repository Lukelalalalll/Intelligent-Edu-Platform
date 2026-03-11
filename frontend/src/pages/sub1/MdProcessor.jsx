import React from 'react';
import '../../styles/base.css';
import '../../styles/sub1/md_processor.css';


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
    handleUpload, handleCheckboxChange, combineSections
}) {
    return (
        <div className="container">
            {/* Page Header */}
            <header className="page-header">
                <h1><i className="fas fa-file-alt" aria-hidden="true"></i> Markdown File Processor</h1>
                <p>Process and enhance your PDF and Markdown files with intelligent section extraction</p>
            </header>

            {/* File Upload Section */}
            <section className="card" aria-labelledby="upload-title">
                <div className="card-body">
                    <h5 id="upload-title" className="card-title">
                        <i className="fas fa-upload" aria-hidden="true"></i> Upload File
                    </h5>

                    <div id="fileInfo" className="file-info mb-3" style={{ display: file ? 'block' : 'none' }}>
                        <div className="file-info-content">
                            <i className="fas fa-file-alt"></i>
                            <div className="file-details">
                                <span id="fileName" className="file-name">{file?.name}</span>
                                <span id="fileSize" className="file-size">{file ? formatFileSize(file.size) : ''}</span>
                            </div>
                            <button type="button" id="clearFileBtn" className="btn btn-sm btn-outline-danger" onClick={clearFile}>
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
                            <div className="file-input-container">
                                <input
                                    type="file"
                                    className="form-control"
                                    id="fileInput"
                                    accept=".pdf,.md"
                                    onChange={onFileChange}
                                    ref={fileInputRef}
                                />
                                <div
                                    className={`file-drop-area ${isDragging ? 'active' : ''}`}
                                    id="fileDropArea"
                                    onDragOver={handleDragOver}
                                    onDragEnter={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                >
                                    <i className="fas fa-cloud-upload-alt" aria-hidden="true"></i>
                                    <p>Drag & drop your file here or click to browse</p>
                                    <span className="file-types">Supports PDF and Markdown files (Max: 10MB)</span>
                                </div>
                            </div>
                        </div>
                        <div className="mb-4 form-check">
                            <input
                                type="checkbox"
                                className="form-check-input"
                                id="useLLMCheckbox"
                                checked={useLLM}
                                onChange={(e) => setUseLLM(e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="useLLMCheckbox">
                                <i className="fas fa-robot" aria-hidden="true"></i> Fetch enhanced headers using LLM
                            </label>
                        </div>
                        <button
                            type="submit"
                            className={`btn btn-primary ${uploadStatus === 'start' ? 'processing' : ''}`}
                            id="uploadBtn"
                            disabled={!file || uploadStatus === 'start'}
                        >
                            <i className="fas fa-cloud-upload-alt" aria-hidden="true"></i> Process
                        </button>
                    </form>
                </div>
            </section>

            {/* Headers List Section */}
            <section id="headersSection" className="card" aria-labelledby="headers-title">
                <div className="card-body">
                    <h5 id="headers-title" className="card-title">
                        <i className="fas fa-list-ul" aria-hidden="true"></i> Select Required Sections
                    </h5>

                    <div id="headersList" className="mt-4" aria-live="polite">
                        {!file && headers.length === 0 && (
                            <div className="empty-state">
                                <i className="fas fa-file-alt" aria-hidden="true"></i>
                                <p>No file uploaded yet. Upload a file to see available sections.</p>
                            </div>
                        )}

                        {file && headers.length === 0 && uploadStatus === 'success' && (
                            <div className="empty-state text-center py-4">
                                <i className="fas fa-info-circle mb-3" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
                                <p className="text-muted">No headers found in the document.</p>
                            </div>
                        )}

                        {headers.length > 0 && (
                            <div className="headers-container">
                                {headers.map(header => (
                                    <div key={header.index} className={`header-item header-level-${header.level}`}>
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
                        <div className="mt-4" id="actionButtons" style={{ display: 'flex' }}>
                            <button id="combineBtn" className="btn btn-success" onClick={() => combineSections('/sub1/index')}>
                                <i className="fas fa-file-export" aria-hidden="true"></i> Generate Combined File
                            </button>
                            <button id="highlightBtn" className="btn btn-primary" onClick={() => combineSections('/sub1/index')}>
                                <i className="fas fa-highlighter" aria-hidden="true"></i> Highlight & Proceed
                            </button>
                            <button id="quickProceedBtn" className="btn btn-secondary" onClick={() => combineSections('/sub1/processor')}>
                                <i className="fas fa-bolt" aria-hidden="true"></i> Quick Proceed
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {loading && (
                <div id="loading" className="card mt-3" aria-live="polite" aria-atomic="true">
                    <div className="card-body text-center">
                        <div className="spinner-border" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="mt-3 mb-0">Processing request, please wait...</p>
                        <small className="text-muted">This may take a few moments</small>
                        <div className="progress mt-3" style={{ height: '6px' }}>
                            <div className="progress-bar progress-bar-striped progress-bar-animated"
                                 role="progressbar" style={{ width: '100%' }} aria-valuenow="100"
                                 aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                    </div>
                </div>
            )}

            {errorMsg && (
                <div id="errorAlert" className="alert alert-danger mt-3" role="alert" aria-live="polite">
                    {errorMsg}
                </div>
            )}
        </div>
    );
}