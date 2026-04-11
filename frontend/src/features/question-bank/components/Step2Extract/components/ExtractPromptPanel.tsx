import React from 'react';
import styles from '../../../styles/ExtractPanel.module.css';

type Props = {
    extractPrompt: string;
    setExtractPrompt: (value: string) => void;
    extractContent: () => void;
    extractLoading: boolean;
    file?: File | null;
    fileType?: string;
    selectedPages: number[];
    rawExtractText?: string;
    hasExtractedResult: boolean;
    loadingRef: React.RefObject<HTMLDivElement>;
};

export default function ExtractPromptPanel({
    extractPrompt,
    setExtractPrompt,
    extractContent,
    extractLoading,
    file,
    fileType,
    selectedPages,
    rawExtractText,
    hasExtractedResult,
    loadingRef,
}: Props) {
    return (
        <>
            <div className={styles.formGroup}>
                <label>Extraction Prompt:</label>
                <input
                    type="text"
                    className={styles.formControl}
                    value={extractPrompt}
                    onChange={(e) => setExtractPrompt(e.target.value)}
                    placeholder="e.g.: exercise, question, practice"
                />
            </div>

            <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={extractContent}
                disabled={!file || (fileType === 'pdf' && selectedPages.length === 0) || extractLoading}
            >
                {extractLoading
                    ? <><i className="fas fa-spinner fa-spin"></i> Extracting...</>
                    : <><i className="fas fa-search"></i> Start Extraction</>}
            </button>

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
        </>
    );
}
