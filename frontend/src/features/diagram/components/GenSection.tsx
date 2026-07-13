import React from 'react';
import DOMPurify from 'dompurify';
import styles from '../styles/diagram.module.css';
import genStyles from '../styles/genSection.module.css';

const INPUT_TABS = [
    { key: 'file', icon: 'fas fa-file-alt', label: 'Upload File' },
    { key: 'text', icon: 'fas fa-keyboard', label: 'Type Text' },
];

const CHAR_WARN = 300;
const CHAR_MAX = 2000;

function downloadSvgBlob(svgString) {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
}

export default function GenSection({ genState, genHandlers }) {
    const {
        inputMode, file, isDragging, loading, data, error,
        text, provider, aiDescription, aiExpandLoading, aiExpandError,
    } = genState;

    const charCount = (text || '').length;
    const canGenerate =
        (inputMode === 'file' && !!file) ||
        (inputMode === 'text' && !!(aiDescription?.trim() || text?.trim()));

    return (
        <div className="card">
            <div className="card-header">
                <div className="card-icon"><i className="fas fa-robot"></i></div>
                <h4>AI Generate</h4>
            </div>
            <div className="card-content">
                {/* ─── Input Mode Tabs ─── */}
                <div className={genStyles.genTabs}>
                    {INPUT_TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`${genStyles.genTab} ${inputMode === tab.key ? genStyles.genTabActive : ''}`}
                            onClick={() => genHandlers.setInputMode(tab.key)}
                        >
                            <i className={tab.icon}></i> {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ margin: '8px 0 12px 0' }}>
                    <label style={{ marginRight: 8 }}>Model</label>
                    <select value={provider || 'local_ollama'} onChange={(e) => genHandlers.setProvider?.(e.target.value)}>
                        <option value="coze">Coze</option>
                        <option value="local_ollama">llama3.2</option>
                        <option value="deepseek">DeepSeek</option>
                    </select>
                </div>

                {/* ─── File Upload Panel ─── */}
                {inputMode === 'file' && (
                    <div
                        className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
                        onDragOver={genHandlers.handleDragOver}
                        onDragLeave={genHandlers.handleDragLeave}
                        onDrop={genHandlers.handleDrop}
                    >
                        <i className="fas fa-file-alt"></i>
                        <p>Upload a text file for AI generation</p>
                        <input type="file" accept=".txt" className={styles.fileInput} onChange={genHandlers.handleFileChange} />
                        {file && <p className={styles.fileName}>Selected: {file.name}</p>}
                    </div>
                )}

                {/* ─── Type Text Panel — split: left = user input, right = AI description ── */}
                {inputMode === 'text' && (
                    <div className={genStyles.genTextSplit}>
                        {/* Left: user input */}
                        <div className={genStyles.genTextHalf}>
                            <div className={genStyles.genTextHalfLabel}>
                                <span><i className="fas fa-pencil-alt" style={{ marginRight: 5 }}></i>Your Input</span>
                                <span className={charCount > CHAR_WARN ? genStyles.genCharCountWarn : genStyles.genCharCount}>
                                    {charCount} / {CHAR_MAX}
                                </span>
                            </div>
                            <textarea
                                className={genStyles.genTextArea}
                                rows={6}
                                maxLength={CHAR_MAX}
                                placeholder="Enter keywords or a brief description, e.g. 'Software development lifecycle, 6 phases, iterative'"
                                value={text}
                                onChange={e => genHandlers.setText(e.target.value)}
                            />
                            <button
                                className={genStyles.genAiExpandBtn}
                                onClick={genHandlers.handleAiExpand}
                                disabled={aiExpandLoading || !text?.trim()}
                                title="Let AI expand your input into a detailed diagram prompt"
                            >
                                {aiExpandLoading
                                    ? <><i className="fas fa-spinner fa-spin"></i> Expanding...</>
                                    : <><i className="fas fa-wand-magic-sparkles"></i> AI Generate Content</>}
                            </button>
                            {aiExpandError && <span className={genStyles.genAiExpandError}>{aiExpandError}</span>}
                        </div>

                        {/* Right: AI-generated diagram description */}
                        <div className={genStyles.genTextHalf}>
                            <div className={genStyles.genTextHalfLabel}>
                                <span><i className="fas fa-robot" style={{ marginRight: 5 }}></i>AI Diagram Description</span>
                                {aiDescription && (
                                    <span
                                        style={{ fontSize: '0.78rem', color: '#94a3b8', cursor: 'pointer' }}
                                        onClick={() => genHandlers.setAiDescription('')}
                                        title="Clear AI content"
                                    >
                                        <i className="fas fa-times"></i> Clear
                                    </span>
                                )}
                            </div>
                            <textarea
                                className={genStyles.genAiTextArea}
                                rows={6}
                                placeholder={aiExpandLoading
                                    ? 'AI is generating detailed diagram description...'
                                    : 'AI-expanded diagram description will appear here.\nYou can also edit it manually before generating.'}
                                value={aiDescription}
                                onChange={e => genHandlers.setAiDescription(e.target.value)}
                                readOnly={aiExpandLoading}
                            />
                        </div>
                    </div>
                )}

                {/* ─── Generate Button ─── */}
                <button
                    className="btn"
                    onClick={genHandlers.handleGenerate}
                    disabled={loading || !canGenerate}
                    style={{ marginTop: '1rem' }}
                >
                    {loading
                        ? <><i className="fas fa-spinner fa-spin"></i> Generating Diagram...</>
                        : <><i className="fas fa-diagram-project"></i> Generate Diagram</>}
                </button>

                {error && <p style={{ color: '#e74c3c', marginTop: '1rem', fontSize: '0.9rem' }}>{error}</p>}

                {/* ─── SVG Result ─── */}
                {data?.svg && (
                    <div className={genStyles.genResult}>
                        <div className={genStyles.genResultHeader}>
                            <h3><i className="fas fa-check-circle" style={{ color: '#00b894' }}></i> Generated Diagram</h3>
                            <button className={`btn ${genStyles.genDownloadBtn}`} onClick={() => downloadSvgBlob(data.svg)}>
                                <i className="fas fa-download"></i> Download SVG
                            </button>
                        </div>
                        <div
                            className={genStyles.genSvgContainer}
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.svg, { USE_PROFILES: { svg: true } }) }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
