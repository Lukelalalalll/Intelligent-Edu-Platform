// frontend/pages/sub4/DiagramTool.jsx

import React from 'react';
import styles from '../../styles/sub4/sub4.module.css';
import '../../styles/base.css';

export default function DiagramTool({
    extractState, searchState, genState, editorState, modalState,
    extractHandlers, searchHandlers, genHandlers, editorHandlers, modalHandlers
}) {
    return (
        <div className="container">
            <div className="page-header">
                <h1>Diagram Tool</h1>
                <p className="subtitle">Create, edit and generate diagrams with AI assistance</p>
            </div>

            {/* 1. Extract */}
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

                    {extractState.error && <p style={{color:'red', marginTop:'1rem'}}>{extractState.error}</p>}

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

            {/* 2. Search & Edit */}
            <div className="card">
                <div className="card-header">
                    <div className="card-icon"><i className="fas fa-search"></i></div>
                    <h4>2. Search & Edit SVG</h4>
                </div>
                <div className="card-content">
                    <div className={styles.searchBox}>
                        <input type="text" className="form-control" placeholder="Enter diagram prompt" value={searchState.query} onChange={e => searchState.setQuery(e.target.value)} />
                        <button className="btn" onClick={searchHandlers.handleSearch} disabled={searchState.loading}>
                            {searchState.loading ? <><i className="fas fa-spinner fa-spin"></i> Searching...</> : <><i className="fas fa-search"></i> Search</>}
                        </button>
                    </div>

                    {searchState.error && <p style={{color:'red'}}>{searchState.error}</p>}

                    {!editorState.isVisible && (
                        <div className={styles.resultsContainer}>
                            {searchState.results === null ? null : searchState.results.length > 0 ? (
                                searchState.results.map((item, idx) => (
                                    <div key={idx} className={styles.searchResultItem} onClick={() => editorHandlers.loadEditor(item.svg)}>
                                        <img src={item.thumb} alt={item.title} title={item.title} />
                                        <div>{item.title || 'Untitled'}</div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyState}>No SVG diagrams found for your search.</div>
                            )}
                        </div>
                    )}

                    {/* SVG Editor */}
                    {editorState.isVisible && (
                        <div className={styles.editor}>
                            {editorState.loading ? (
                                <p><i className="fas fa-spinner fa-spin"></i> Loading SVG editor...</p>
                            ) : editorState.error ? (
                                <p style={{color:'red'}}>{editorState.error}</p>
                            ) : (
                                <>
                                    <div className={styles.editorButtons}>
                                        <button className={styles.editorBtn} onClick={editorHandlers.applyChanges}><i className="fas fa-check"></i> Apply Changes</button>
                                        <button className={styles.editorBtn} onClick={editorHandlers.downloadSvg}><i className="fas fa-download"></i> Download SVG</button>
                                        <button className={styles.editorBtn} onClick={() => editorHandlers.setIsVisible(false)}><i className="fas fa-times"></i> Close Editor</button>
                                    </div>
                                    <div className={styles.editorContainer}>
                                        <div className={styles.preview}>
                                            <h3 style={{padding: '10px', margin:0, borderBottom: '1px solid #eee'}}>Preview</h3>
                                            <iframe srcDoc={editorState.previewHtml} title="SVG Preview"></iframe>
                                        </div>
                                        <div className={styles.editorFields}>
                                            <h3 style={{margin: '0 0 10px 0'}}>Editable Text Fields</h3>
                                            {editorState.fields.length === 0 ? (
                                                <p>No editable text fields found in this SVG.</p>
                                            ) : (
                                                editorState.fields.map((field, idx) => (
                                                    <div key={field.id} className={styles.entry}>
                                                        <label>Text {idx + 1}</label>
                                                        <input value={field.value} onChange={(e) => editorHandlers.handleFieldChange(idx, e.target.value)} />
                                                        <button className={styles.removeBtn} onClick={() => editorHandlers.handleRemoveField(idx)}>&times;</button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 3. AI Generate */}
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

                    {genState.error && <p style={{color:'red', marginTop:'1rem'}}>{genState.error}</p>}

                    {genState.data && (
                        <div className={styles.generatedResult} style={{marginTop: '2rem'}}>
                            <h3>Generated Diagram</h3>
                            {genState.data.pdf_base64 ? (
                                <iframe src={`data:application/pdf;base64,${genState.data.pdf_base64}`} width="100%" height="500px" style={{border: '1px solid #ccc', borderRadius: '8px'}}></iframe>
                            ) : (
                                <>
                                    <iframe src={genState.data.pdf_url} width="100%" height="500px" style={{border: '1px solid #ccc', borderRadius: '8px'}}></iframe>
                                    <a href={genState.data.pdf_url} target="_blank" rel="noreferrer" className="btn" style={{marginTop: '10px'}}><i className="fas fa-download"></i> Download PDF</a>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            <div className={`${styles.modalOverlay} ${modalState.isOpen ? styles.modalActive : ''}`} onClick={(e) => e.target.classList.contains(styles.modalOverlay) && modalHandlers.closeModal()}>
                <div className={styles.modalContent}>
                    <button className={styles.modalClose} onClick={modalHandlers.closeModal}><i className="fas fa-times"></i></button>
                    <div className={styles.modalPreview}>
                        {modalState.imgSrc ? <img src={modalState.imgSrc} alt="Preview" /> : null}
                    </div>
                    <div className={styles.modalActions}>
                        <h4>Diagram Preview</h4>
                        <p>High-resolution extracted diagram from your document. You can download it directly to your device.</p>
                        <button className="btn" onClick={modalHandlers.downloadImage} style={{width: '100%'}}><i className="fas fa-download"></i> Download Image</button>
                    </div>
                </div>
            </div>
        </div>
    );
}