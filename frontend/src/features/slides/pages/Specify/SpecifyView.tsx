import React from 'react';
import styles from './styles/specify.module.css';
import WelcomeBanner from '../../../../shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import SlidesLoadingState from '../../components/SlidesLoadingState';

/** Converts `<br>` / `<br/>` / `<br />` inside table cells into real line-break rendering. */
function renderCellText(text) {
    if (typeof text !== 'string') return text;
    const parts = text.split(/<br\s*\/?>/gi);
    if (parts.length <= 1) return text;
    return parts.map((p, i) => (
        <React.Fragment key={i}>{p}{i < parts.length - 1 && <br />}</React.Fragment>
    ));
}

export default function Specify({
    highlightsData, tablesBySection, formState, setFormState,
    handleCheckboxChange, handleSubmit, loading, errorMsg,
    results, talkingScriptResult, handleProceed,
    handleDownloadScript
}) {
    const isEntranceActive = usePageEntrance();

    return (
        <div className={`container ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                title="Configure Your Scripts"
                subtitle="Customize bullet points, and generate talking scripts"
                variant="workspace"
            />

            {loading ? (
                <SlidesLoadingState />
            ) : results && results.length > 0 ? (
                <div className={`card ${styles.resultsWrapper}`}>
                    <div className="card-header">
                        <div className="card-icon" style={{ color: '#FFC107', background: 'rgba(255, 193, 7, 0.1)' }}>
                            <i className="fas fa-layer-group"></i>
                        </div>
                        <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Slides Scripts Preview</h2>
                    </div>

                    <div className="card-content">
                        <div className={styles.slidesGridLayout}>
                            {results.map((slide, index) => (
                                <div key={index} className={styles.slideCardElegant}>
                                    <div className={styles.slideNumberBadge}>SLIDE {index + 1}</div>
                                    <h4>{slide.title}</h4>
                                    <ul className={styles.slideBulletsList}>
                                        {(slide.bullets || slide.content || []).map((bullet, i) => (
                                            <li key={i}>{bullet}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        {talkingScriptResult && (
                            <div className={styles.talkingScriptElegant}>
                                <div className={styles.scriptInfo}>
                                    <h4><i className="fas fa-microphone-alt"></i> Speech Script Ready</h4>
                                    <p>Generated <strong>{talkingScriptResult.total_scripts}</strong> sections. Estimated duration: <strong>{talkingScriptResult.estimated_total_duration}</strong>.</p>
                                </div>
                                {talkingScriptResult.word_document?.available && (
                                    <button
                                        onClick={(e) => handleDownloadScript(
                                            e,
                                            talkingScriptResult.word_document.download_url,
                                            talkingScriptResult.word_document.filename
                                        )}
                                        className={styles.btnDownloadWord}
                                    >
                                        <i className="fas fa-file-word"></i> Download .docx
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="text-center mt-5">
                            <button className={styles.btnProceed} onClick={handleProceed}>
                                Preview in PowerPoint <i className="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={styles.workspaceStack}>
                    {/* 1. Highlights Review */}
                    <div className="card">
                        <div className="card-header">
                            <div className="card-icon" style={{ color: 'var(--aurora-cyan)', background: 'rgba(0, 184, 217, 0.1)' }}>
                                <i className="fas fa-bookmark"></i>
                            </div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Selected Highlights</h2>
                        </div>
                        <div className="card-content">
                            <div className={`${styles.highlightsContainer} ${styles.customScrollbar}`}>
                                {highlightsData.length === 0 ? (
                                    <p style={{ color: 'var(--text-sub)' }}>No highlights saved yet.</p>
                                ) : (
                                    highlightsData.map((section, idx) => (
                                        <div key={idx} className={styles.highlightSection}>
                                            <h4>{section.sectionTitle}</h4>
                                            <div>
                                                {section.highlights.map(h => (
                                                    <div key={h.id} className={styles.highlightItem}>{h.text}</div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. Configuration Form */}
                    <div className="card">
                        <div className="card-header">
                            <div className="card-icon"><i className="fas fa-sliders-h"></i></div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Generation Settings</h2>
                        </div>
                        <div className="card-content">
                            <form onSubmit={handleSubmit}>
                                <div className={styles.formRow2}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Number of Bullets per Slide</label>
                                        <input type="number" className={styles.formControl} min="1" max="5" required
                                            value={formState.numOfBullets} onChange={e => setFormState({ ...formState, numOfBullets: e.target.value })} />
                                        <div className={styles.formHelper}>Recommended: 3-5 bullets for optimal readability</div>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Max Words per Bullet</label>
                                        <input type="number" className={styles.formControl} min="10" max="30" required
                                            value={formState.wordsEachBullet} onChange={e => setFormState({ ...formState, wordsEachBullet: e.target.value })} />
                                        <div className={styles.formHelper}>Keep it concise (10-30 words)</div>
                                    </div>
                                </div>

                                <div className={`${styles.formGroup} ${styles.nestedCard}`}>
                                    <div className={styles.nestedHeader}><i className="fas fa-table"></i> Include Tables from Sections</div>
                                    <div className={`${styles.tablesList} ${styles.customScrollbar}`}>
                                        {Object.keys(tablesBySection).length === 0 ? (
                                            <p style={{ color: 'var(--text-sub)' }}>No tables found in selected sections.</p>
                                        ) : (
                                            (Object.entries(tablesBySection) as [string, any[]][]).map(([title, tables]) => (
                                                <div key={title} style={{ marginBottom: '1rem' }}>
                                                    <h6 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{title}</h6>
                                                    {tables.map(table => (
                                                        <div key={table.index} className={styles.tableItem}>
                                                            <div style={{ marginBottom: '8px' }}>
                                                                <label className={styles.customCheckbox}>
                                                                    <input type="checkbox" checked={formState.selectedTables.includes(table.index)} onChange={() => handleCheckboxChange(table.index)} />
                                                                    <span className={styles.checkmark}></span>
                                                                    <span>Table {table.index}</span>
                                                                </label>
                                                            </div>
                                                            <div className={styles.tablePreview}>
                                                                <table>
                                                                    <thead>
                                                                        <tr>{table.table?.header?.map((h, i) => <th key={i}>{renderCellText(h)}</th>)}</tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {table.table?.rows?.slice(0, 2).map((row, rIdx) => (
                                                                            <tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx}>{renderCellText(cell)}</td>)}</tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.customCheckbox}>
                                        <input type="checkbox" checked={formState.generateTalkingScript} onChange={e => setFormState({ ...formState, generateTalkingScript: e.target.checked })} />
                                        <span className={styles.checkmark}></span>
                                        <span>Generate Talking Script <i className="fas fa-microphone-alt"></i></span>
                                    </label>
                                </div>

                                {formState.generateTalkingScript && (
                                    <div className={styles.scriptOptionsPanel}>
                                        <div className={styles.formRow2}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Script Tone & Style</label>
                                                <select className={styles.formSelect} value={formState.scriptStyle} onChange={e => setFormState({ ...formState, scriptStyle: e.target.value })}>
                                                    <option value="academic">Academic (Formal & Professional)</option>
                                                    <option value="business">Business (Concise & Impactful)</option>
                                                    <option value="casual">Casual (Friendly & Relaxed)</option>
                                                </select>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Presentation Title</label>
                                                <input type="text" className={styles.formControl} value={formState.presentationTitle} onChange={e => setFormState({ ...formState, presentationTitle: e.target.value })} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={styles.customCheckbox}>
                                                <input type="checkbox" checked={formState.generateWordDocument} onChange={e => setFormState({ ...formState, generateWordDocument: e.target.checked })} />
                                                <span className={styles.checkmark}></span>
                                                <span>Export as Word Document (.docx)</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {errorMsg && <div style={{ color: 'var(--error-color)', background: '#FFEBEB', padding: '10px', borderRadius: '8px', marginTop: '1rem' }}>{errorMsg}</div>}

                                <button type="submit" className={styles.btnPrimary} style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                                    <i className="fas fa-magic"></i> {loading ? "Analyzing Context..." : "Generate Presentation Content"}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
