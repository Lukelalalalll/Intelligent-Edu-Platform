import React, { useRef } from 'react';
import styles from '../../styles/sub3/sub3.module.css';

// --- 子组件：画廊图片卡片 ---
const ImageGalleryItem = ({ item, isSelected, onToggleSelect, onPreview }) => (
    <div className={`${styles.imageItem} ${isSelected ? styles.imageItemSelected : ''}`} onClick={() => onToggleSelect(item)}>
        <img src={item.src} alt={item.caption || "Extracted Image"} loading="lazy" />
        <div className={styles.imageOverlay}>
            <button
                className={`${styles.actionIconBtn} ${styles.previewBtn}`}
                onClick={(e) => { e.stopPropagation(); onPreview(item.src); }}
                title="Preview Full Size"
            >
                <i className="fas fa-eye"></i>
            </button>
            <button
                className={`${styles.actionIconBtn} ${isSelected ? styles.selectBtnSelected : styles.selectBtn}`}
                title={isSelected ? "Deselect" : "Select"}
            >
                <i className={`fas ${isSelected ? 'fa-check' : 'fa-plus'}`}></i>
            </button>
        </div>
    </div>
);

// --- 子组件：已选图片缩略图 ---
const SelectedImageItem = ({ item, onRemove, onPreview }) => (
    <div className={styles.selectedImageItem}>
        <img src={item.src} alt="Selected" onClick={() => onPreview(item.src)} />
        <button className={styles.removeBtn} onClick={onRemove} title="Remove"><i className="fas fa-times"></i></button>
    </div>
);

// --- 主视图组件 ---
export default function ImageExtractor({
    states: {
        isDragging, uploadStatus, currentChapter, activeTab,
        imagesByChapter, selectedImages, aiPrompt, aiNum, aiImages,
        loading, loadingText, lightboxImage, notifications
    },
    handlers: {
        handleDragOver, handleDragLeave, handleDrop, handleFileInput,
        setCurrentChapter, setActiveTab, setAiPrompt, setAiNum,
        generateAiImages, toggleImageSelection, removeSelectedImage,
        setLightboxImage, exportZip, exportPDF
    }
}) {
    const fileInputRef = useRef(null);

    return (
        <div className={styles.container}>
            {/* Notifications Toast */}
            {notifications.map(n => (
                <div key={n.id} className={`${styles.notification} ${n.type === 'error' ? styles.notifError : n.type === 'success' ? styles.notifSuccess : styles.notifInfo}`}>
                    <i className={`fas ${n.type === 'error' ? 'fa-exclamation-circle' : n.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}`}></i>
                    {n.message}
                </div>
            ))}

            {/* Lightbox Modal */}
            {lightboxImage && (
                <div className={styles.lightbox} onClick={() => setLightboxImage(null)}>
                    <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.lightboxClose} onClick={() => setLightboxImage(null)}>&times;</button>
                        <img src={lightboxImage} alt="Full Screen Preview" />
                    </div>
                </div>
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className={styles.loadingOverlay} style={{ display: 'flex' }}>
                    <div className={styles.loadingSpinner}></div>
                    <p>{loadingText}</p>
                </div>
            )}

            <header className={styles.header}>
                <h1><i className="fas fa-images"></i> AI Image Selector & Extractor</h1>
                <p className={styles.subtitle}>Extract images from PDF or generate new ones with AI assistance</p>
            </header>

            {/* Section 1: Upload */}
            <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}><i className="fas fa-file-upload"></i></div>
                    <h2>1. Upload Source File</h2>
                </div>
                <div
                    className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <i className="fas fa-cloud-upload-alt"></i>
                    <p>Drag & drop your PDF file here or click to browse</p>
                    <input type="file" accept=".pdf" className={styles.fileInput} ref={fileInputRef} onChange={handleFileInput} />
                </div>
                {uploadStatus && (
                    <div className={styles.uploadStatus}>
                        <i className={`fas ${uploadStatus.includes('❌') ? 'fa-times-circle' : uploadStatus.includes('✅') ? 'fa-check-circle' : 'fa-spinner fa-spin'}`}></i>
                        {uploadStatus}
                    </div>
                )}
            </div>

            {/* Section 2: Controls & Tabs */}
            <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}><i className="fas fa-sliders-h"></i></div>
                    <h2>2. Source Controls</h2>
                </div>
                <div className={styles.controlSection}>
                    <div className={styles.controlGroup}>
                        <label>Choose Chapter</label>
                        <select className={styles.dropdown} value={currentChapter} onChange={(e) => setCurrentChapter(e.target.value)}>
                            {Object.keys(imagesByChapter).length === 0 ? <option value="None">None</option> : null}
                            {Object.keys(imagesByChapter).map(ch => <option key={ch} value={ch}>{ch}</option>)}
                        </select>
                    </div>
                    <div className={styles.sourceTabs}>
                        <div className={styles.tabButtons}>
                            <button className={`${styles.tabBtn} ${activeTab === 'uploaded' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('uploaded')}>
                                <i className="fas fa-file-image"></i> Extracted PDF Images
                            </button>
                            <button className={`${styles.tabBtn} ${activeTab === 'ai' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('ai')}>
                                <i className="fas fa-robot"></i> AI Generation
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tab Content: Uploaded Gallery */}
                {activeTab === 'uploaded' && (
                    <div style={{ marginTop: '2rem', animation: 'fadeIn 0.5s' }}>
                        <div className={styles.galleryGrid}>
                            {currentChapter !== 'None' && imagesByChapter[currentChapter] ? (
                                imagesByChapter[currentChapter].map((img, idx) => (
                                    <ImageGalleryItem
                                        key={idx} item={img}
                                        isSelected={selectedImages.some(s => s.src === img.src)}
                                        onToggleSelect={toggleImageSelection} onPreview={setLightboxImage}
                                    />
                                ))
                            ) : (
                                <div className={styles.emptyState}>No images extracted yet. Please upload a PDF.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Tab Content: AI Gallery */}
                {activeTab === 'ai' && (
                    <div style={{ marginTop: '2rem', animation: 'fadeIn 0.5s' }}>
                        <div className={styles.aiControls}>
                            <input type="text" className={styles.promptInput} style={{ flex: 1 }} placeholder="Enter prompt for AI image generation..." value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && generateAiImages()} />
                            <div className={styles.sliderGroup}>
                                <label>Images:</label>
                                <input type="range" min="1" max="8" value={aiNum} onChange={e => setAiNum(e.target.value)} />
                                <span style={{ fontWeight: 'bold', color: 'var(--primary-color)', width: '20px' }}>{aiNum}</span>
                            </div>
                            <button className={styles.generateBtn} onClick={generateAiImages} disabled={loading}>
                                <i className="fas fa-magic"></i> Generate
                            </button>
                        </div>
                        <div className={styles.galleryGrid}>
                            {aiImages.length > 0 ? (
                                aiImages.map((img, idx) => (
                                    <ImageGalleryItem
                                        key={`ai-${idx}`} item={img}
                                        isSelected={selectedImages.some(s => s.src === img.src)}
                                        onToggleSelect={toggleImageSelection} onPreview={setLightboxImage}
                                    />
                                ))
                            ) : (
                                <div className={styles.emptyState}>Enter a prompt and click generate to create AI images.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Section 3: Selected & Export */}
            <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                    <div className={styles.cardIcon} style={{ background: 'rgba(255, 171, 0, 0.1)', color: 'var(--accent-yellow)' }}><i className="fas fa-check-square"></i></div>
                    <h2>3. Selected Images ({selectedImages.length})</h2>
                </div>

                <div className={`${styles.selectedGallery} ${selectedImages.length > 0 ? styles.selectedGalleryHasItems : ''}`}>
                    {selectedImages.length > 0 ? (
                        selectedImages.map((img, idx) => (
                            <SelectedImageItem key={`sel-${idx}`} item={img} onRemove={() => removeSelectedImage(img)} onPreview={setLightboxImage} />
                        ))
                    ) : (
                        <div className={styles.emptyState} style={{ padding: '1.5rem', background: 'transparent', border: 'none' }}>Click the '+' icon on any image to select it for export.</div>
                    )}
                </div>

                <div className={styles.cardHeader} style={{ marginTop: '3rem' }}>
                    <div className={styles.cardIcon} style={{ background: 'rgba(32, 101, 209, 0.1)', color: 'var(--aurora-blue)' }}><i className="fas fa-download"></i></div>
                    <h2>4. Export Options</h2>
                </div>
                <div className={styles.exportButtons}>
                    <button className={styles.exportBtn} onClick={exportZip} disabled={selectedImages.length === 0 || loading}>
                        <i className="fas fa-file-archive" style={{ color: '#ff922b' }}></i> Export as ZIP
                    </button>
                    <button className={styles.exportBtn} onClick={exportPDF} disabled={selectedImages.length === 0 || loading}>
                        <i className="fas fa-file-pdf" style={{ color: '#fa5252' }}></i> Export as PDF
                    </button>
                </div>
            </div>
        </div>
    );
}