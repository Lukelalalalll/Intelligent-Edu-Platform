import React from 'react';
import ReactMarkdown from 'react-markdown';
import styles from '../../../styles/sub2.module.css';
import type { GeneratedQuestionsPanelProps } from '../types';

export default function GeneratedQuestionsPanel({ generatedQuestions, generateLoading, exportQuestions }: GeneratedQuestionsPanelProps) {
    if (!generatedQuestions || generateLoading) {
        return null;
    }

    return (
        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed rgba(0,0,0,0.1)' }}>
            <div className={styles.markdownContainer}>
                <ReactMarkdown>{generatedQuestions}</ReactMarkdown>
            </div>

            <div className={styles.exportOptions}>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => exportQuestions()}>
                    <i className="fas fa-file-code"></i> Export as Markdown (.md)
                </button>
            </div>
        </div>
    );
}
