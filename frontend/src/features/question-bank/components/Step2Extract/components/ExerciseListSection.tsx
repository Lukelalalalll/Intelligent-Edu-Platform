import React from 'react';
import styles from '../../../styles/sub2.module.css';
import ExerciseCard from '../../ExerciseCard';

type Screenshot = { filename: string; dataUrl: string };

type Props = {
    exercises: Array<{ text?: string }>;
    selectedExercises: number[];
    savedScreenshots: Screenshot[];
    editingIndex: number | null;
    editBuffer: string;
    setEditBuffer: (v: string) => void;
    startEdit: (index: number) => void;
    saveEdit: () => void;
    cancelEdit: () => void;
    takeSingleScreenshot: (index: number) => void;
    deleteExercise: (index: number) => void;
    toggleExercise: (index: number) => void;
    updateExerciseText: (index: number, value: string) => void;
    toggleAllExercises: (checked: boolean) => void;
    clearExerciseSelection: () => void;
    takeBatchScreenshots: () => void;
    onOpenGallery: () => void;
    toolbarRef: React.RefObject<HTMLDivElement>;
};

export default function ExerciseListSection({
    exercises,
    selectedExercises,
    savedScreenshots,
    editingIndex,
    editBuffer,
    setEditBuffer,
    startEdit,
    saveEdit,
    cancelEdit,
    takeSingleScreenshot,
    deleteExercise,
    toggleExercise,
    updateExerciseText,
    toggleAllExercises,
    clearExerciseSelection,
    takeBatchScreenshots,
    onOpenGallery,
    toolbarRef,
}: Props) {
    if (!exercises || exercises.length === 0) return null;

    return (
        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
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
                    <i className="fas fa-camera"></i> Curate Visual Reference Set
                </button>
                {savedScreenshots.length > 0 && (
                    <button className={`${styles.btn} ${styles.btnGallery}`} onClick={onOpenGallery}>
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
    );
}
