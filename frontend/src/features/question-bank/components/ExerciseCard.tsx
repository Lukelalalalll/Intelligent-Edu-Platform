import React from 'react';
import ReactMarkdown from 'react-markdown';
import styles from '../styles/sub2.module.css';

interface Exercise {
    title?: string;
    text?: string;
    chapter_number?: string;
    sub_chapter_number?: string;
    page_number?: string;
    question_number?: string;
    images?: string[];
}

interface ExerciseCardProps {
    ex: Exercise;
    index: number;
    editingIndex: number | null;
    editBuffer: string;
    selectedExercises: number[];
    startEdit: (index: number) => void;
    saveEdit: () => void;
    cancelEdit: () => void;
    setEditBuffer: (value: string) => void;
    takeSingleScreenshot: (index: number) => void;
    deleteExercise: (index: number) => void;
    toggleExercise: (index: number) => void;
    updateExerciseText: (index: number, text: string) => void;
}

export default function ExerciseCard({
    ex, index, editingIndex, editBuffer, selectedExercises,
    startEdit, saveEdit, cancelEdit, setEditBuffer,
    takeSingleScreenshot, deleteExercise, toggleExercise,
}: ExerciseCardProps) {
    return (
        <div
            id={`exercise-card-${index}`}
            className={styles.exerciseItem}
            data-chapter={ex.chapter_number || `ch${index + 1}`}
            data-sub={ex.sub_chapter_number || `s${index + 1}`}
            data-q={ex.question_number || `q${index + 1}`}
        >
            <div className={styles.exerciseHeader}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input
                        type="checkbox"
                        style={{ width: '18px', height: '18px', marginTop: '4px', cursor: 'pointer' }}
                        checked={selectedExercises.includes(index)}
                        onChange={() => toggleExercise(index)}
                    />
                    <div>
                        <h5 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                            {ex.title || `Exercise ${index + 1}`}
                        </h5>
                        <div className={styles.exerciseMeta}>
                            <span className={styles.metaItem}><i className="fas fa-book"></i> Ch: {ex.chapter_number || '-'}</span>
                            <span className={styles.metaItem}><i className="fas fa-bookmark"></i> Sub: {ex.sub_chapter_number || '-'}</span>
                            <span className={styles.metaItem}><i className="fas fa-file-alt"></i> Pg: {ex.page_number || '-'}</span>
                            <span className={styles.metaItem}><i className="fas fa-list-ol"></i> Q: {ex.question_number || '-'}</span>
                        </div>
                    </div>
                </div>
                <div className={styles.exerciseActions}>
                    <button className={`${styles.btn} ${styles.btnScreenshot}`} onClick={() => takeSingleScreenshot(index)} title="Screenshot">
                        <i className="fas fa-camera"></i>
                    </button>
                    <button
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                        onClick={() => editingIndex === index ? cancelEdit() : startEdit(index)}
                        title={editingIndex === index ? 'Cancel' : 'Edit'}
                    >
                        <i className={`fas ${editingIndex === index ? 'fa-times' : 'fa-edit'}`}></i>
                    </button>
                    <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => deleteExercise(index)} title="Delete">
                        <i className="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div className={styles.exerciseContent}>
                {editingIndex === index ? (
                    <div>
                        <textarea
                            className={styles.formControl}
                            rows={8}
                            value={editBuffer}
                            onChange={e => setEditBuffer(e.target.value)}
                            style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                        />
                        <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginTop: '8px', fontSize: '0.85rem' }} onClick={saveEdit}>
                            <i className="fas fa-check"></i> Save
                        </button>
                    </div>
                ) : (
                    <ReactMarkdown>{ex.text || 'No content'}</ReactMarkdown>
                )}
            </div>
            {ex.images && ex.images.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                    {ex.images.map((url, i) => (
                        <img key={i} src={url} alt="exercise" style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)', marginTop: '10px' }} crossOrigin="anonymous" />
                    ))}
                </div>
            )}
        </div>
    );
}
