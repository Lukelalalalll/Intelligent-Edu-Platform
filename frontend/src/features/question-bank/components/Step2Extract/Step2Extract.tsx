import React, { useState, useRef, useEffect } from 'react';
import styles from '../../styles/sub2.module.css';
import DirectSourceMode from './components/DirectSourceMode';
import ExtractPromptPanel from './components/ExtractPromptPanel';
import ExerciseListSection from './components/ExerciseListSection';
import ScreenshotGalleryModal from './components/ScreenshotGalleryModal';

export default function Step2Extract({ states, handlers }) {
    const { file, fileName, fileType, selectedPages, extractPrompt, extractLoading, exercises, selectedExercises, rawExtractText, savedScreenshots, generationMode } = states;
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

    const startEdit = (index: number) => {
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

    if (generationMode === 'pdf_direct') {
        return (
            <DirectSourceMode
                file={file}
                fileName={fileName}
                fileType={fileType}
                selectedPages={selectedPages}
                goToStep1={goToStep1}
                goToStep3={goToStep3}
            />
        );
    }

    return (
        <div className={styles.step2Wrapper}>
            {/* Scrollable content area */}
            <div className={styles.step2ScrollArea} ref={scrollAreaRef}>
                <div className={styles.stepTitle}>
                    <div className={styles.stepNumber}>2</div>
                    Extract Content
                </div>

                <ExtractPromptPanel
                    extractPrompt={extractPrompt}
                    setExtractPrompt={setExtractPrompt}
                    extractContent={extractContent}
                    extractLoading={extractLoading}
                    file={file}
                    fileType={fileType}
                    selectedPages={selectedPages}
                    rawExtractText={rawExtractText}
                    hasExtractedResult={hasExtractedResult}
                    loadingRef={loadingRef}
                />

                {!extractLoading && (
                    <ExerciseListSection
                        exercises={exercises}
                        selectedExercises={selectedExercises}
                        savedScreenshots={savedScreenshots}
                        editingIndex={editingIndex}
                        editBuffer={editBuffer}
                        setEditBuffer={setEditBuffer}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                        takeSingleScreenshot={takeSingleScreenshot}
                        deleteExercise={deleteExercise}
                        toggleExercise={toggleExercise}
                        updateExerciseText={updateExerciseText}
                        toggleAllExercises={toggleAllExercises}
                        clearExerciseSelection={clearExerciseSelection}
                        takeBatchScreenshots={takeBatchScreenshots}
                        onOpenGallery={() => setGalleryOpen(true)}
                        toolbarRef={toolbarRef}
                    />
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

            <ScreenshotGalleryModal
                open={galleryOpen}
                closing={galleryClosing}
                screenshots={savedScreenshots}
                onClose={closeGallery}
                onDownloadAll={downloadAll}
                onDownloadSingle={downloadScreenshot}
                onRemove={removeScreenshot}
            />
        </div>
    );
}