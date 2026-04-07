import React from 'react';
import styles from '../styles/quickProcess.module.css';

export default function QuickProcess({
    loading, contentLoading, sections, formState, setFormState,
    maxAllowedPages, totalChapters, errorMsg,
    results, talkingScriptResult,
    handleSubmit, handleProceed, handleDownloadScript
}) {
    return (
        <div className={styles.container}>
            <header className="page-header">
                <h1><i className="fas fa-magic"></i> Quick Content Processor</h1>
                <p>Auto-generate structured PPT content and scripts from all chapters</p>
            </header>

            <div className={styles.layoutGrid}>
                {/* Left: Original Content Preview */}
                <div className={`card ${styles.contentCard}`}>
                    <div className="card-body">
                        <h5 className={styles.cardTitle}><i className="fas fa-file-alt"></i> Original Content</h5>
                        <div className={styles.markdownContent}>
                            {contentLoading ? (
                                <div className="text-center py-5"><i className="fas fa-spinner fa-spin fa-2x"></i></div>
                            ) : (
                                sections.map((sec, i) => (
                                    <div key={i} className={styles.sectionItem}>
                                        <h4>{sec.title}</h4>
                                        <div dangerouslySetInnerHTML={{ __html: sec.content }} />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Generation Settings */}
                <div className={`card ${styles.settingsCard}`}>
                    <div className="card-body">
                        <h5 className={styles.cardTitle}><i className="fas fa-cog"></i> Settings</h5>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Total Pages</label>
                                <input type="number" className={styles.formControl} value={formState.totalPages}
                                    onChange={e => setFormState({ ...formState, totalPages: e.target.value })} required />
                                <div className={styles.formText}>
                                    • Found Chapters: <strong>{totalChapters}</strong><br />
                                    • Range: <strong>{totalChapters} - {maxAllowedPages}</strong> pages
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Bullets per Slide</label>
                                <input type="number" className={styles.formControl} min="1" max="5" value={formState.numOfBullets}
                                    onChange={e => setFormState({ ...formState, numOfBullets: e.target.value })} required />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.customCheckbox}>
                                    <input type="checkbox" checked={formState.generateTalkingScript}
                                        onChange={e => setFormState({ ...formState, generateTalkingScript: e.target.checked })} />
                                    <span className="checkmark"></span>
                                    <span style={{ marginLeft: '30px' }}>Generate Talking Script</span>
                                </label>
                            </div>

                            {formState.generateTalkingScript && (
                                <div className={styles.scriptOptionsPanel}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Script Style</label>
                                        <select className={styles.formControl} value={formState.scriptStyle} onChange={e => setFormState({ ...formState, scriptStyle: e.target.value })}>
                                            <option value="academic">Academic</option>
                                            <option value="business">Business</option>
                                            <option value="casual">Casual</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Doc Title</label>
                                        <input type="text" className={styles.formControl} value={formState.presentationTitle} onChange={e => setFormState({ ...formState, presentationTitle: e.target.value })} />
                                    </div>
                                </div>
                            )}

                            {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

                            <button type="submit" className="btn btn-primary w-100" style={{ marginTop: '20px' }} disabled={loading || contentLoading}>
                                {loading ? <><i className="fas fa-spinner fa-spin"></i> Generating...</> : <><i className="fas fa-play"></i> Generate PPT Content</>}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Results Area */}
            {(loading || results) && (
                <div className="card mt-5" style={{ padding: '40px' }}>
                    <h2 className={styles.cardTitle}><i className="fas fa-list-check"></i> Generated Results</h2>

                    {loading ? (
                        /* 🌟 移植自 Specify 的大脑动画 */
                        <div className={styles.elegantLoadingContainer}>
                            <div className={styles.spinnerCore}>
                                <div className={`${styles.ring} ${styles.ring1}`}></div>
                                <div className={`${styles.ring} ${styles.ring2}`}></div>
                                <div className={`${styles.ring} ${styles.ring3}`}></div>
                                <i className={`fas fa-brain ${styles.aiIcon}`}></i>
                            </div>
                            <h3 className={styles.loadingText}>AI is crafting your slides...</h3>
                            <p className={styles.loadingSubtext}>Structuring logic, extracting core values, and formatting content.</p>
                        </div>
                    ) : (
                        <div className="fade-in">
                            <div className={styles.slidesGridLayout}>
                                {results.map((slide, i) => (
                                    <div key={i} className={styles.slideCard}>
                                        <div style={{ position: 'absolute', top: '15px', right: '20px', color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 800, opacity: 0.5 }}>
                                            SLIDE {i + 1}
                                        </div>
                                        <h4>{slide.title}</h4>
                                        <ul style={{ listStyle: 'none', padding: 0 }}>
                                            {slide.content.map((b, j) => (
                                                <li key={j} style={{ position: 'relative', paddingLeft: '25px', marginBottom: '10px', fontSize: '1.05rem' }}>
                                                    <span style={{ position: 'absolute', left: 0, color: 'var(--aurora-cyan)' }}>•</span> {b}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            {/* 🌟 移植自 Specify 的脚本卡片 */}
                            {talkingScriptResult?.word_document?.available && (
                                <div className={styles.talkingScriptElegant}>
                                    <div className={styles.scriptInfo}>
                                        <h4><i className="fas fa-microphone-alt"></i> Speech Script Ready</h4>
                                        <p>Your professionally tailored presentation notes are available for download.</p>
                                    </div>
                                    <button
                                        onClick={(e) => handleDownloadScript(e, talkingScriptResult.word_document.download_url, talkingScriptResult.word_document.filename)}
                                        className={styles.btnDownloadWord}
                                    >
                                        <i className="fas fa-file-word"></i> Download .docx
                                    </button>
                                </div>
                            )}

                            <div className="text-center" style={{ marginTop: '2.5rem', marginBottom: '3rem' }}>
                                <button className={styles.btnProceed} onClick={handleProceed}>
                                    Confirm & Proceed to Templates <i className="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}