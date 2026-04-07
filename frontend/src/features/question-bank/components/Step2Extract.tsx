// frontend/src/pages/sub2/components/Step2Extract.tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles/sub2.module.css';
import ExerciseCard from './ExerciseCard';

export default function Step2Extract({ states, handlers }) {
    const { file, fileType, selectedPages, extractPrompt, extractLoading, exercises, selectedExercises, rawExtractText, savedScreenshots } = states;
    const { setExtractPrompt, extractContent, toggleExercise, toggleAllExercises, clearExerciseSelection, updateExerciseText, deleteExercise, takeSingleScreenshot, takeBatchScreenshots, removeScreenshot, goToStep1, goToStep3 } = handlers;

    const [editingIndex, setEditingIndex] = useState(null);
    const [editBuffer, setEditBuffer] = useState('');
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryClosing, setGalleryClosing] = useState(false);

    const closeGallery = () => {
        setGalleryClosing(true);
        setTimeout(() => {
            setGalleryOpen(false);
            setGalleryClosing(false);
        }, 200);
    };

    const loadingRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const prevExtractLoading = useRef(false);

    useEffect(() => {
        if (extractLoading && !prevExtractLoading.current) {
            // extraction just started → scroll to brain animation
            setTimeout(() => {
                loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        if (!extractLoading && prevExtractLoading.current) {
            // extraction just finished → scroll to toolbar/exercises
            setTimeout(() => {
                toolbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 200);
        }
        prevExtractLoading.current = extractLoading;
    }, [extractLoading]);

    const startEdit = (index) => {
        setEditBuffer(exercises[index]?.text || '');
        setEditingIndex(index);
    };
    const saveEdit = () => {
        if (editingIndex !== null) {
            updateExerciseText(editingIndex, editBuffer);
            setEditingIndex(null);
            setEditBuffer('');
        }
    };
    const cancelEdit = () => {
        setEditingIndex(null);
        setEditBuffer('');
    };

    const downloadScreenshot = (shot: { filename: string; dataUrl: string }) => {
        const a = document.createElement('a');
        a.href = shot.dataUrl;
        a.download = shot.filename;
        a.click();
    };

    const downloadAll = () => {
        savedScreenshots.forEach((shot) => {
            const a = document.createElement('a');
            a.href = shot.dataUrl;
            a.download = shot.filename;
            a.click();
        });
    };

    const hasExtractedResult = (Array.isArray(exercises) && exercises.length > 0) || Boolean(rawExtractText);

    return (
        <div className={styles.step2Wrapper}>
            {/* Scrollable content area */}
            <div className={styles.step2ScrollArea} ref={scrollAreaRef}>
                <div className={styles.stepTitle}>
                    <div className={styles.stepNumber}>2</div>
                    Extract Content
                </div>

                <div className={styles.formGroup}>
                    <label>Extraction Prompt:</label>
                    <input type="text" className={styles.formControl} value={extractPrompt} onChange={e => setExtractPrompt(e.target.value)} placeholder="e.g.: exercise, question, practice" />
                </div>

                <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={extractContent}
                    disabled={(!file) || (fileType === 'pdf' && selectedPages.length === 0) || extractLoading}
                >
                    {extractLoading ? <><i className="fas fa-spinner fa-spin"></i> Extracting...</> : <><i className="fas fa-search"></i> Start Extraction</>}
                </button>

                {/* Brain loading animation during extraction */}
                {extractLoading && (
                    <div ref={loadingRef} className={styles.extractLoadingContainer}>
                        <div className={styles.spinnerCore}>
                            <div className={`${styles.ring} ${styles.ring1}`}></div>
                            <div className={`${styles.ring} ${styles.ring2}`}></div>
                            <div className={`${styles.ring} ${styles.ring3}`}></div>
                            <i className={`fas fa-brain ${styles.aiIcon}`}></i>
                        </div>
                        <h3 className={styles.extractLoadingText}>Intelligent Extracting...</h3>
                        <p className={styles.extractLoadingSubtext}>Analyzing document structure, identifying exercises, and parsing content.</p>
                    </div>
                )}

                {rawExtractText && !extractLoading && (
                    <div className={styles.infoBox} style={{ marginTop: '20px' }}>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{rawExtractText}</pre>
                    </div>
                )}

                {/* Empty state when nothing extracted yet */}
                {!extractLoading && !hasExtractedResult && (
                    <div className={styles.extractEmptyState}>
                        <div className={styles.emptyStateIcon}>
                            <i className="fas fa-file-search"></i>
                        </div>
                        <h4 className={styles.emptyStateTitle}>Ready to Extract</h4>
                        <p className={styles.emptyStateDesc}>
                            Upload a document and click <strong>Start Extraction</strong> to automatically identify and parse exercises, questions, and practice problems from your file.
                        </p>
                        <div className={styles.emptyStateFeatures}>
                            <div className={styles.emptyFeatureItem}>
                                <i className="fas fa-magic"></i>
                                <span>AI-powered content recognition</span>
                            </div>
                            <div className={styles.emptyFeatureItem}>
                                <i className="fas fa-camera"></i>
                                <span>Screenshot & export exercises</span>
                            </div>
                            <div className={styles.emptyFeatureItem}>
                                <i className="fas fa-edit"></i>
                                <span>Edit & refine extracted content</span>
                            </div>
                        </div>
                    </div>
                )}

                {exercises && exercises.length > 0 && !extractLoading && (
                    <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
                        {/* Toolbar */}
                        <div ref={toolbarRef} className={styles.extractToolbar}>
                            <label className={styles.extractToolbarCheckbox}>
                                <input
                                    type="checkbox"
                                    onChange={(e) => toggleAllExercises(e.target.checked)}
                                    checked={selectedExercises.length === exercises.length && exercises.length > 0}
                                />
                                <strong>Select All</strong>
                            </label>
                            <button className={`${styles.btn} ${styles.btnScreenshot}`} onClick={takeBatchScreenshots}>
                                <i className="fas fa-camera"></i> Batch Screenshot
                            </button>
                            {savedScreenshots.length > 0 && (
                                <button className={`${styles.btn} ${styles.btnGallery}`} onClick={() => setGalleryOpen(true)}>
                                    <i className="fas fa-images"></i> Gallery ({savedScreenshots.length})
                                </button>
                            )}
                            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={clearExerciseSelection} style={{ marginLeft: 'auto' }}>
                                <i className="fas fa-times"></i> Clear
                            </button>
                        </div>

                        {exercises.map((ex, index) => (
                            <ExerciseCard
                                key={index}
                                ex={ex}
                                index={index}
                                editingIndex={editingIndex}
                                editBuffer={editBuffer}
                                selectedExercises={selectedExercises}
                                startEdit={startEdit}
                                saveEdit={saveEdit}
                                cancelEdit={cancelEdit}
                                setEditBuffer={setEditBuffer}
                                takeSingleScreenshot={takeSingleScreenshot}
                                deleteExercise={deleteExercise}
                                toggleExercise={toggleExercise}
                                updateExerciseText={updateExerciseText}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Fixed bottom navigation */}
            <div className={styles.step2BottomBar}>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={goToStep1}>
                    <i className="fas fa-arrow-left"></i> Back: Upload File
                </button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={goToStep3} disabled={!hasExtractedResult || extractLoading}>
                    Next: Generate Questions <i className="fas fa-arrow-right" style={{ marginLeft: '8px' }}></i>
                </button>
            </div>

            {/* Screenshot Gallery Modal */}
            {galleryOpen && createPortal(
                <div className={`${styles.galleryOverlay} ${galleryClosing ? styles.galleryOverlayClosing : ''}`} onClick={closeGallery}>
                    <div className={`${styles.galleryModal} ${galleryClosing ? styles.galleryModalClosing : ''}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.galleryHeader}>
                            <h3 style={{ margin: 0 }}><i className="fas fa-images" style={{ marginRight: '10px' }}></i>Screenshot Gallery</h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {savedScreenshots.length > 1 && (
                                    <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={downloadAll}>
                                        <i className="fas fa-download"></i> Download All
                                    </button>
                                )}
                                <button className={styles.galleryClose} onClick={closeGallery}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div className={styles.galleryGrid}>
                            {savedScreenshots.map((shot, i) => (
                                <div key={shot.filename} className={styles.galleryCard}>
                                    <div className={styles.galleryImgWrap}>
                                        <img src={shot.dataUrl} alt={shot.filename} />
                                    </div>
                                    <div className={styles.galleryCardFooter}>
                                        <span className={styles.galleryFilename} title={shot.filename}>{shot.filename}</span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className={styles.galleryBtn} onClick={() => downloadScreenshot(shot)} title="Download">
                                                <i className="fas fa-download"></i>
                                            </button>
                                            <button className={`${styles.galleryBtn} ${styles.galleryBtnDanger}`} onClick={() => removeScreenshot(shot.filename)} title="Remove">
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {savedScreenshots.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                                <i className="fas fa-camera" style={{ fontSize: '2rem', marginBottom: '10px', display: 'block' }}></i>
                                No screenshots captured yet.
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}