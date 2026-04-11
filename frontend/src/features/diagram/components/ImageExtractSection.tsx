import React, { useRef } from 'react';
import styles from '../styles/diagram.module.css';

const ImageGalleryItem = ({ item, isSelected, onToggleSelect, onPreview }) => (
    <div
        className={`${styles.imgWrapper} ${isSelected ? styles.imgWrapperSelected : ''}`}
        onClick={() => onToggleSelect(item)}
        style={{ cursor: 'pointer' }}
    >
        <img src={item.src} alt={item.caption || 'Extracted Image'} loading="lazy" />
        <div className={styles.imgOverlay}>
            <button
                className={styles.overlayBtn}
                onClick={(e) => { e.stopPropagation(); onPreview(item.src); }}
                title="Preview"
            >
                <i className="fas fa-eye"></i>
            </button>
            <span className={styles.overlayBtn} title={isSelected ? 'Selected' : 'Select'}>
                <i className={`fas ${isSelected ? 'fa-check-circle' : 'fa-plus-circle'}`}></i>
            </span>
        </div>
    </div>
);

export default function ImageExtractSection({ imageState, imageHandlers }) {
    const fileInputRef = useRef(null);

    const {
        isDragging, uploadStatus, currentChapter, activeTab,
        imagesByChapter, selectedImages, aiPrompt, aiNum, aiImages,
        loading, loadingText, lightboxImage, notifications,
    } = imageState;

    const {
        handleDragOver, handleDragLeave, handleDrop, handleFileInput,
        setCurrentChapter, setActiveTab, setAiPrompt, setAiNum,
        generateAiImages, toggleImageSelection, removeSelectedImage,
        setLightboxImage, exportZip, exportPDF,
    } = imageHandlers;

    return (
        <div>
            {/* Notifications */}
            {notifications.map(n => (
                <div key={n.id} className={styles.notification} style={{
                    background: n.type === 'error' ? '#fee2e2' : n.type === 'success' ? '#dcfce7' : '#e0f2fe',
                    color: n.type === 'error' ? '#991b1b' : n.type === 'success' ? '#166534' : '#075985',
                    padding: '10px 16px', borderRadius: 8, marginBottom: 8, fontSize: '0.9rem',
                }}>
                    <i className={`fas ${n.type === 'error' ? 'fa-exclamation-circle' : n.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}`}></i>
                    {' '}{n.message}
                </div>
            ))}

            {/* Lightbox */}
            {lightboxImage && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setLightboxImage(null)}>
                    <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setLightboxImage(null)}
                            style={{ position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fff', fontSize: 18, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                            &times;
                        </button>
                        <img src={lightboxImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary-color)' }}>
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, marginBottom: 8 }}></i>
                    <p>{loadingText}</p>
                </div>
            )}

            {/* Upload */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <div className="card-icon"><i className="fas fa-file-image"></i></div>
                    <h4>Upload PDF to Extract Images</h4>
                </div>
                <div className="card-content">
                    <div
                        className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <i className="fas fa-cloud-upload-alt"></i>
                        <p>Drag & drop your PDF file here or click to browse</p>
                        <input type="file" accept=".pdf" className={styles.fileInput} ref={fileInputRef} onChange={handleFileInput} />
                    </div>
                    {uploadStatus && (
                        <p style={{ marginTop: 8, fontSize: '0.9rem', color: uploadStatus.includes('❌') ? '#b91c1c' : '#166534' }}>
                            {uploadStatus}
                        </p>
                    )}
                </div>
            </div>

            {/* Source Tabs: Extracted vs AI */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <div className="card-icon"><i className="fas fa-sliders-h"></i></div>
                    <h4>Image Source</h4>
                </div>
                <div className="card-content">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <button
                            className={`${styles.tabBtn} ${activeTab === 'uploaded' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                            onClick={() => setActiveTab('uploaded')}
                        >
                            <i className="fas fa-file-image"></i> Extracted
                        </button>
                        <button
                            className={`${styles.tabBtn} ${activeTab === 'ai' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                            onClick={() => setActiveTab('ai')}
                        >
                            <i className="fas fa-robot"></i> AI Generate
                        </button>
                    </div>

                    {/* Chapter selector */}
                    {activeTab === 'uploaded' && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-sub)' }}>Chapter: </label>
                                <select value={currentChapter} onChange={e => setCurrentChapter(e.target.value)}
                                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                                    {Object.keys(imagesByChapter).length === 0
                                        ? <option value="None">None</option>
                                        : Object.keys(imagesByChapter).map(ch => <option key={ch} value={ch}>{ch}</option>)
                                    }
                                </select>
                            </div>
                            <div className={styles.resultsContainer}>
                                {currentChapter !== 'None' && imagesByChapter[currentChapter]
                                    ? imagesByChapter[currentChapter].map((img, idx) => (
                                        <ImageGalleryItem key={idx} item={img}
                                            isSelected={selectedImages.some(s => s.src === img.src)}
                                            onToggleSelect={toggleImageSelection} onPreview={setLightboxImage} />
                                    ))
                                    : <div className={styles.emptyState}>No images extracted yet. Upload a PDF above.</div>
                                }
                            </div>
                        </>
                    )}

                    {/* AI Generate */}
                    {activeTab === 'ai' && (
                        <>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                                <input type="text" placeholder="Describe the image to generate..."
                                    value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && generateAiImages()}
                                    style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1' }} />
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Count:</label>
                                <input type="range" min="1" max="8" value={aiNum} onChange={e => setAiNum(e.target.value)} style={{ width: 80 }} />
                                <span style={{ fontWeight: 700, color: 'var(--primary-color)', minWidth: 16 }}>{aiNum}</span>
                                <button className="btn" onClick={generateAiImages} disabled={loading}>
                                    <i className="fas fa-magic"></i> Generate
                                </button>
                            </div>
                            <div className={styles.resultsContainer}>
                                {aiImages.length > 0
                                    ? aiImages.map((img, idx) => (
                                        <ImageGalleryItem key={`ai-${idx}`} item={img}
                                            isSelected={selectedImages.some(s => s.src === img.src)}
                                            onToggleSelect={toggleImageSelection} onPreview={setLightboxImage} />
                                    ))
                                    : <div className={styles.emptyState}>Enter a prompt above and click Generate.</div>
                                }
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Selected Images & Export */}
            <div className="card">
                <div className="card-header">
                    <div className="card-icon"><i className="fas fa-check-square"></i></div>
                    <h4>Selected Images ({selectedImages.length})</h4>
                </div>
                <div className="card-content">
                    {selectedImages.length > 0 ? (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                            {selectedImages.map((img, idx) => (
                                <div key={`sel-${idx}`} style={{ position: 'relative', width: 80, height: 80 }}>
                                    <img src={img.src} alt="Selected" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                                        onClick={() => setLightboxImage(img.src)} />
                                    <button onClick={() => removeSelectedImage(img)}
                                        style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem' }}>Click images above to select them for export.</p>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn" onClick={exportZip} disabled={selectedImages.length === 0 || loading}>
                            <i className="fas fa-file-archive"></i> Export ZIP
                        </button>
                        <button className="btn" onClick={exportPDF} disabled={selectedImages.length === 0 || loading}>
                            <i className="fas fa-file-pdf"></i> Export PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
