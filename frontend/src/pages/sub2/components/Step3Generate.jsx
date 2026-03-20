// frontend/src/pages/sub2/components/Step3Generate.jsx
import React from 'react';
import styles from '../../../styles/sub2/sub2.module.css';
import ReactMarkdown from "react-markdown";
export default function Step3Generate({ states, handlers }) {
    const { exercises, rawExtractText, subject, questionType, numQuestions, difficulty, constraints, questionBasis, knowledgePoints, savedScreenshots, generateLoading, generatedQuestions } = states;
    const { setSubject, setQuestionType, setNumQuestions, setDifficulty, setConstraints, setQuestionBasis, setKnowledgePoints, generateQuestions, exportQuestions } = handlers;

    return (
        <div className={styles.stepContainer}>
            <div className={styles.stepTitle}>
                <div className={styles.stepNumber}>3</div>
                Generate New Questions
            </div>

            <div className={styles.formGroup}>
                <label>Subject:</label>
                <input type="text" className={styles.formControl} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g.: Mathematics, Physics" />
            </div>

            <div className={styles.formGroup}>
                <label>Question Type:</label>
                <select className={styles.formControl} value={questionType} onChange={e => setQuestionType(e.target.value)}>
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
                <input type="number" className={styles.formControl} value={numQuestions} onChange={e => setNumQuestions(e.target.value)} disabled={['Quiz', 'Exam Paper'].includes(questionType)} />
            </div>

            <div className={styles.formGroup}>
                <label>Difficulty Level:</label>
                <select className={styles.formControl} value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                    <option value="1">Basic</option>
                    <option value="2">Easy</option>
                    <option value="3">Medium</option>
                    <option value="4">Hard</option>
                    <option value="5">Competition Level</option>
                </select>
            </div>

            <div className={styles.formGroup}>
                <label>Additional Requirements:</label>
                <textarea className={styles.formControl} rows="3" value={constraints} onChange={e => setConstraints(e.target.value)} placeholder="e.g.: Include calculation steps, require graphical explanation"></textarea>
            </div>

            <div className={styles.formGroup}>
                <label>Question Basis:</label>
                <select className={styles.formControl} value={questionBasis} onChange={e => setQuestionBasis(e.target.value)}>
                    <option value="">Please select question basis</option>
                    <option value="knowledge_points">Knowledge points</option>
                    <option value="example_images">Example images from extracted content</option>
                </select>
            </div>

            {questionBasis === 'knowledge_points' && (
                <div className={styles.formGroup}>
                    <label>Knowledge Points:</label>
                    <textarea className={styles.formControl} rows="4" value={knowledgePoints} onChange={e => setKnowledgePoints(e.target.value)} placeholder="e.g.: calculus, derivatives, limits"></textarea>
                </div>
            )}

            {questionBasis === 'example_images' && (
                <div className={styles.formGroup}>
                    <div className={styles.infoBox}>
                        <p style={{ margin: 0 }}>Will use saved question images from extraction step as question basis.</p>
                        <div style={{ color: 'var(--primary-color)', fontWeight: 'bold', marginTop: '8px' }}>
                            {savedScreenshots.length} images saved as basis.
                        </div>
                    </div>
                </div>
            )}

            <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={generateQuestions}
                style={{ marginTop: '10px' }}
                disabled={generateLoading || (!exercises.length && !rawExtractText)}
            >
                {generateLoading ? <><i className="fas fa-spinner fa-spin"></i> Generating...</> : <><i className="fas fa-robot"></i> Generate Questions</>}
            </button>

            {generatedQuestions && !generateLoading && (
                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
                    {/* 使用 ReactMarkdown 替换原来的 dangerouslySetInnerHTML */}
                    <div className={styles.markdownContainer}>
                        <ReactMarkdown>{generatedQuestions.replace(/<br>/g, '\n')}</ReactMarkdown>
                    </div>

                    <div className={styles.exportOptions}>
                        {/* 修改导出按钮，只保留导出 MD */}
                        <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => exportQuestions('markdown')}>
                            <i className="fas fa-file-code"></i> Export as Markdown (.md)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}