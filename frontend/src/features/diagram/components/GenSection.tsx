import React from 'react';
import DOMPurify from 'dompurify';
import styles from '../styles/sub4.module.css';

const INPUT_TABS = [
    { key: 'file', icon: 'fas fa-file-alt', label: 'Upload File' },
    { key: 'text', icon: 'fas fa-keyboard', label: 'Type Text' },
    { key: 'coze', icon: 'fas fa-magic', label: 'Coze AI' },
];

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
    const { inputMode, file, isDragging, loading, data, error, text, cozeKeywords, cozeLoading, cozeText, provider } = genState;
    const canGenerate =
        (inputMode === 'file' && !!file) ||
        (inputMode === 'text' && !!text?.trim()) ||
        (inputMode === 'coze' && !!cozeText?.trim());

    return (
        <div className="card">
            <div className="card-header">
                <div className="card-icon"><i className="fas fa-robot"></i></div>
                <h4>3. AI Generate</h4>
            </div>
            <div className="card-content">
                {/* ─── Input Mode Tabs ─── */}
                <div className={styles.genTabs}>
                    {INPUT_TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`${styles.genTab} ${inputMode === tab.key ? styles.genTabActive : ''}`}
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

                {/* ─── Direct Text Panel ─── */}
                {inputMode === 'text' && (
                    <div className={styles.genTextPanel}>
                        <textarea
                            className={styles.genTextArea}
                            rows={6}
                            placeholder="Describe the diagram you want to generate... e.g. 'A flowchart showing the software development lifecycle with 6 phases'"
                            value={text}
                            onChange={e => genHandlers.setText(e.target.value)}
                        />
                    </div>
                )}

                {/* ─── Coze AI Panel ─── */}
                {inputMode === 'coze' && (
                    <div className={styles.genCozePanel}>
                        <div className={styles.genCozeRow}>
                            <input
                                type="text"
                                className={styles.genCozeInput}
                                placeholder="Enter keywords... e.g. 'TCP/IP 4-layer model'"
                                value={cozeKeywords}
                                onChange={e => genHandlers.setCozeKeywords(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !cozeLoading && genHandlers.handleCozeGenerate()}
                            />
                            <button
                                className={`btn ${styles.genCozeBtn}`}
                                onClick={genHandlers.handleCozeGenerate}
                                disabled={cozeLoading || !cozeKeywords?.trim()}
                            >
                                {cozeLoading
                                    ? <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                                    : <><i className="fas fa-wand-magic-sparkles"></i> Expand</>}
                            </button>
                        </div>
                        <textarea
                            className={styles.genTextArea}
                            rows={6}
                            placeholder="Coze AI will generate a detailed description here. You can edit it before generating the diagram."
                            value={cozeText}
                            onChange={e => genHandlers.setCozeText(e.target.value)}
                        />
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
                    <div className={styles.genResult}>
                        <div className={styles.genResultHeader}>
                            <h3><i className="fas fa-check-circle" style={{ color: '#00b894' }}></i> Generated Diagram</h3>
                            <button className={`btn ${styles.genDownloadBtn}`} onClick={() => downloadSvgBlob(data.svg)}>
                                <i className="fas fa-download"></i> Download SVG
                            </button>
                        </div>
                        <div
                            className={styles.genSvgContainer}
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}