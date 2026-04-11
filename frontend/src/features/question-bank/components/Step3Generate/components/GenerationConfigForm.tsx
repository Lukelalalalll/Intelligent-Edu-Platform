import React from 'react';
import styles from '../../../styles/questionBank.module.css';
import type { GenerationConfigFormProps } from '../types';

export default function GenerationConfigForm({
    questionType,
    numQuestions,
    difficulty,
    constraints,
    constraintSuggestions,
    isSuggestingConstraints,
    outputLanguage,
    provider,
    setQuestionType,
    setNumQuestions,
    setDifficulty,
    setConstraints,
    setOutputLanguage,
    setProvider,
    onSuggestConstraints,
}: GenerationConfigFormProps) {
    return (
        <>
            <div className={styles.configGrid2}>
                <div className={styles.formGroup}>
                    <label>Question Type:</label>
                    <select className={styles.formControl} value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
                        <option value="Multiple choice">Multiple choice</option>
                        <option value="Fill-in-the-blank">Fill-in-the-blank</option>
                        <option value="Calculation">Calculation</option>
                        <option value="Proof">Proof</option>
                        <option value="Short Answer">Short Answer</option>
                        <option value="Quiz">Quiz</option>
                        <option value="Exam Paper">Exam Paper</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                    <label>Number of Questions:</label>
                    <input
                        type="number"
                        className={styles.formControl}
                        value={numQuestions}
                        onChange={(e) => setNumQuestions(Number(e.target.value || 0))}
                        disabled={['Quiz', 'Exam Paper'].includes(questionType)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Difficulty Level:</label>
                    <select className={styles.formControl} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
                        <option value="1">Basic</option>
                        <option value="2">Easy</option>
                        <option value="3">Medium</option>
                        <option value="4">Hard</option>
                        <option value="5">Competition Level</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                    <label>AI Provider:</label>
                    <select className={styles.formControl} value={provider || 'local_ollama'} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                        <option value="coze">Coze</option>
                        <option value="local_ollama">llama3.2</option>
                    </select>
                </div>
            </div>

            <div className={styles.formGroup}>
                <label>Additional Requirements:</label>
                <textarea
                    className={styles.formControl}
                    rows={3}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="e.g.: Include calculation steps, require graphical explanation"
                ></textarea>
                <div className={styles.suggestRequirementsRow}>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        AI suggestions are hints only and will not auto-fill this field.
                    </small>
                    <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        onClick={onSuggestConstraints}
                        disabled={isSuggestingConstraints}
                    >
                        {isSuggestingConstraints ? 'Suggesting...' : 'Suggest Requirements'}
                    </button>
                </div>

                {constraintSuggestions.length > 0 && (
                    <div className={styles.infoBox} style={{ marginTop: '8px' }}>
                        <strong>AI Suggestions:</strong>
                        <ul style={{ margin: '8px 0 0 18px' }}>
                            {constraintSuggestions.map((item, idx) => (
                                <li key={`${item}-${idx}`}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className={styles.formGroup}>
                <label>Output Language:</label>
                <select className={styles.formControl} value={outputLanguage} onChange={(e) => setOutputLanguage(e.target.value)}>
                    <option value="English">English</option>
                    <option value="Chinese">Chinese</option>
                </select>
            </div>
        </>
    );
}
