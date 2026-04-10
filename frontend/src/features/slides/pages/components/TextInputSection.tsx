import React from 'react';
import styles from '../../styles/md_processor.module.css';

interface TextInputSectionProps {
    textContent: string;
    setTextContent: (v: string) => void;
    textTitle: string;
    setTextTitle: (v: string) => void;
    seedContent: string;
    setSeedContent: (v: string) => void;
    cozeLoading: boolean;
    cozeError: string;
    textProcessing: boolean;
    provider?: string;
    setProvider?: (v: 'coze' | 'local_ollama') => void;
    handleCozeGenerate: () => void;
    handleProcessText: (path: string) => void;
}

export default function TextInputSection({
    textContent, setTextContent, textTitle, setTextTitle,
    seedContent, setSeedContent,
    cozeLoading, cozeError, textProcessing,
    provider, setProvider,
    handleCozeGenerate, handleProcessText,
}: TextInputSectionProps) {
    const wordCount = textContent ? textContent.trim().split(/\s+/).filter(Boolean).length : 0;
    const seedWordCount = seedContent ? seedContent.trim().split(/\s+/).filter(Boolean).length : 0;

    return (
        <section className={`card ${styles.card}`} aria-labelledby="text-title">
            <div className={`card-body ${styles.cardBody}`}>
                <h5 id="text-title" className="card-title">
                    <i className="fas fa-pen-fancy" aria-hidden="true"></i> AI Markdown Generator
                </h5>

                <div className={styles.cozeRow}>
                    <select
                        value={provider || 'local_ollama'}
                        onChange={(e) => setProvider?.(e.target.value as 'coze' | 'local_ollama')}
                        style={{ borderRadius: 8, padding: '6px 10px' }}
                    >
                        <option value="coze">Coze</option>
                        <option value="local_ollama">llama3.2</option>
                    </select>
                    <div className={styles.cozeInputGroup}>
                        <i className="fas fa-lightbulb"></i>
                        <input
                            type="text"
                            className={styles.cozeInput}
                            placeholder="Optional topic (e.g. TCP/IP four-layer model)"
                            value={textTitle}
                            onChange={(e) => setTextTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !cozeLoading && handleCozeGenerate()}
                        />
                    </div>
                    <button
                        className={styles.cozeBtn}
                        onClick={handleCozeGenerate}
                        disabled={cozeLoading || !seedContent.trim()}
                    >
                        {cozeLoading ? (
                            <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                        ) : (
                            <><i className="fas fa-magic"></i> AI Generate</>
                        )}
                    </button>
                </div>

                <div className={styles.textareaWrapper}>
                    <label className={styles.sectionLabel} htmlFor="seed-content-textarea">
                        Basic Content Input
                    </label>
                    <textarea
                        id="seed-content-textarea"
                        className={styles.contentTextarea}
                        placeholder={"Paste your raw notes, key ideas, or rough draft here...\n\nExample:\n- TCP/IP has four layers\n- Explain each layer's responsibility\n- Add practical protocol examples"}
                        value={seedContent}
                        onChange={(e) => setSeedContent(e.target.value)}
                        rows={8}
                    />
                    <div className={styles.wordCountBar}>
                        <span>{seedWordCount} words</span>
                        {seedWordCount > 0 && seedWordCount < 30 && (
                            <span className={styles.wordCountHint}>Tip: 50+ words gives better generation quality</span>
                        )}
                    </div>
                </div>

                {cozeError && (
                    <div className={styles.cozeErrorMsg}>
                        <i className="fas fa-exclamation-circle"></i> {cozeError}
                    </div>
                )}

                <div className={styles.textareaWrapper}>
                    <label className={styles.sectionLabel} htmlFor="generated-md-textarea">
                        Generated Markdown
                    </label>
                    <textarea
                        id="generated-md-textarea"
                        className={styles.contentTextarea}
                        placeholder={"Write your content here using Markdown...\n\n## Section Title\n- Key point 1\n- Key point 2\n\n## Another Section\n- More content..."}
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        rows={14}
                    />
                    <div className={styles.wordCountBar}>
                        <span>{wordCount} words</span>
                        {wordCount > 0 && wordCount < 50 && (
                            <span className={styles.wordCountHint}>Tip: 100+ words recommended for good PPT content</span>
                        )}
                    </div>
                </div>

                <div className={styles.textActionRow}>
                    <button
                        className={`${styles.btn} ${styles.btnPrimary} ${styles.textProceedBtn}`}
                        onClick={() => handleProcessText('/slides/highlighter')}
                        disabled={!textContent.trim() || textProcessing}
                    >
                        {textProcessing ? (
                            <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                        ) : (
                            <><i className="fas fa-highlighter"></i> Next Step</>
                        )}
                    </button>
                </div>
            </div>
        </section>
    );
}
