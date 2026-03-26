// frontend/src/pages/sub2/components/Step2Extract.jsx
import React from 'react';
import styles from '../../../styles/sub2/sub2.module.css';

export default function Step2Extract({ states, handlers }) {
    const { file, fileType, selectedPages, extractPrompt, apiType, extractLoading, exercises, selectedExercises, rawExtractText } = states;
    const { setExtractPrompt, setApiType, extractContent, toggleExercise, toggleAllExercises, clearExerciseSelection, takeSingleScreenshot, takeBatchScreenshots, goToStep1, goToStep3 } = handlers;

    const hasExtractedResult = (Array.isArray(exercises) && exercises.length > 0) || Boolean(rawExtractText);

    return (
        <div className={`${styles.stepContainer} ${styles.extractScrollableContainer}`}>
            <div className={styles.stepTitle}>
                <div className={styles.stepNumber}>2</div>
                Extract Content
            </div>

            <div className={styles.formGroup}>
                <label>Extraction Prompt:</label>
                <input type="text" className={styles.formControl} value={extractPrompt} onChange={e => setExtractPrompt(e.target.value)} placeholder="e.g.: exercise, question, practice" />
            </div>

            <div className={styles.formGroup}>
                <label>API Mode:</label>
                <select className={styles.formControl} value={apiType} onChange={e => setApiType(e.target.value)}>
                    <option value="textin">TextIn Cloud API</option>
                    <option value="deepseek">Local DeepSeek</option>
                    <option value="zhipu">Zhipu AI GLM-4V (Formula Specialist)</option>
                </select>
            </div>

            <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={extractContent}
                disabled={(!file) || (fileType === 'pdf' && selectedPages.length === 0) || extractLoading}
            >
                {extractLoading ? <><i className="fas fa-spinner fa-spin"></i> Extracting...</> : <><i className="fas fa-search"></i> Start Extraction</>}
            </button>

            {rawExtractText && !extractLoading && (
                <div className={styles.infoBox} style={{ marginTop: '20px' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{rawExtractText}</pre>
                </div>
            )}

            {exercises && exercises.length > 0 && !extractLoading && (
                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
                    <div style={{ marginBottom: '15px', padding: '15px', background: '#f8f9fa', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', border: '1px solid #e9ecef' }}>
                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            <input
                                type="checkbox"
                                onChange={(e) => toggleAllExercises(e.target.checked)}
                                checked={selectedExercises.length === exercises.length && exercises.length > 0}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <strong style={{ color: '#333' }}>Select All</strong>
                        </label>
                        <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={takeBatchScreenshots}>
                            <i className="fas fa-camera"></i> Batch Screenshot
                        </button>
                        <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={clearExerciseSelection}>
                            <i className="fas fa-times"></i> Clear
                        </button>
                    </div>

                    {exercises.map((ex, index) => (
                        <div
                            key={index}
                            id={`exercise-card-${index}`}
                            className={styles.exerciseItem}
                            data-chapter={ex.chapter_number || 'unknown'}
                            data-sub={ex.sub_chapter_number || 'unknown'}
                            data-q={ex.question_number || 'unknown'}
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
                                        <h5 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-main)' }}>{ex.title || `Exercise ${index + 1}`}</h5>
                                        <div className={styles.exerciseMeta}>
                                            <span className={styles.metaItem}><i className="fas fa-book"></i> Ch: {ex.chapter_number || '-'}</span>
                                            <span className={styles.metaItem}><i className="fas fa-bookmark"></i> Sub: {ex.sub_chapter_number || '-'}</span>
                                            <span className={styles.metaItem}><i className="fas fa-file-alt"></i> Pg: {ex.page_number || '-'}</span>
                                            <span className={styles.metaItem}><i className="fas fa-list-ol"></i> Q: {ex.question_number || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                                <button className={`${styles.btn} ${styles.btnSuccess}`} style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={() => takeSingleScreenshot(index)}>
                                    <i className="fas fa-camera"></i> Screenshot
                                </button>
                            </div>
                            <div className={styles.exerciseContent} dangerouslySetInnerHTML={{ __html: ex.formattedText }} />
                            {ex.images && ex.images.length > 0 && (
                                <div style={{ marginTop: '15px' }}>
                                    {ex.images.map((url, i) => (
                                        <img key={i} src={url} alt="exercise" style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)', marginTop: '10px' }} crossOrigin="anonymous" />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                <button
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={goToStep1}
                >
                    <i className="fas fa-arrow-left"></i> Back: Upload File
                </button>
                <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={goToStep3}
                    disabled={!hasExtractedResult || extractLoading}
                >
                    Next: Generate Questions <i className="fas fa-arrow-right" style={{ marginLeft: '8px' }}></i>
                </button>
            </div>
        </div>
    );
}