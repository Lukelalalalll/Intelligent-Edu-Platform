import React from 'react';
import styles from '../styles/diagram.module.css';
import editorStyles from '../styles/svgEditor.module.css';

export default function SearchEditSection({ searchState, searchHandlers, editorState, editorHandlers }) {
    return (
        <div className="card">
            <div className="card-header">
                <div className="card-icon"><i className="fas fa-search"></i></div>
                <h4>Search & Edit SVG</h4>
            </div>
            <div className="card-content">
                <div className={styles.searchBox}>
                    <input type="text" className="form-control" placeholder="Enter diagram prompt" value={searchState.query} onChange={e => searchState.setQuery(e.target.value)} />
                    <button className="btn" onClick={searchHandlers.handleSearch} disabled={searchState.loading}>
                        {searchState.loading ? <><i className="fas fa-spinner fa-spin"></i> Searching...</> : <><i className="fas fa-search"></i> Search</>}
                    </button>
                </div>

                {searchState.error && <p style={{ color: 'red' }}>{searchState.error}</p>}

                {!editorState.isVisible && Array.isArray(searchState.results) && searchState.results.length > 0 && (
                    <div style={{ margin: '8px 0 10px', opacity: 0.85, fontSize: 13 }}>
                        Found {searchState.results.length} SVG candidates
                    </div>
                )}

                {!editorState.isVisible && (
                    <div className={styles.resultsContainer}>
                        {searchState.results === null ? null : searchState.results.length > 0 ? (
                            searchState.results.map((item, idx) => (
                                <div key={idx} className={styles.searchResultItem} onClick={() => editorHandlers.loadEditor(item.svg)}>
                                    <img
                                        src={item.thumb}
                                        alt={item.title}
                                        title={item.title}
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <div>{item.title || 'Untitled'}</div>
                                </div>
                            ))
                        ) : (
                            <div className={styles.emptyState}>No SVG diagrams found for your search.</div>
                        )}
                    </div>
                )}

                {/* SVG Editor */}
                {editorState.isVisible && (
                    <div className={editorStyles.editor}>
                        {editorState.loading ? (
                            <p><i className="fas fa-spinner fa-spin"></i> Loading SVG editor...</p>
                        ) : editorState.error ? (
                            <>
                                <p style={{ color: 'red' }}>{editorState.error}</p>
                                <button className={editorStyles.editorBtn} onClick={() => editorHandlers.setIsVisible(false)}>
                                    <i className="fas fa-arrow-left"></i> Back to Results
                                </button>
                            </>
                        ) : (
                            <>
                                <div className={editorStyles.editorButtons}>
                                    <button className={editorStyles.editorBtn} onClick={editorHandlers.applyChanges}><i className="fas fa-check"></i> Apply Changes</button>
                                    <button className={editorStyles.editorBtn} onClick={editorHandlers.downloadSvg}><i className="fas fa-download"></i> Download SVG</button>
                                    <button className={editorStyles.editorBtn} onClick={() => editorHandlers.setIsVisible(false)}><i className="fas fa-times"></i> Close Editor</button>
                                </div>
                                <div className={editorStyles.editorContainer}>
                                    <div className={editorStyles.preview}>
                                        <h3 style={{ padding: '10px', margin: 0, borderBottom: '1px solid #eee' }}>Preview</h3>
                                        <iframe srcDoc={editorState.previewHtml} title="SVG Preview" sandbox="allow-same-origin"></iframe>
                                    </div>
                                    <div className={editorStyles.editorFields}>
                                        <h3 style={{ margin: '0 0 10px 0' }}>Editable Text Fields</h3>
                                        {editorState.fields.length === 0 ? (
                                            <p style={{ color: '#888', fontSize: '0.9rem' }}>No editable text fields found in this SVG.</p>
                                        ) : editorState.fields[0]?._readonly ? (
                                            <p style={{ color: '#e67e22', fontSize: '0.88rem', lineHeight: 1.5 }}>
                                                <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>
                                                {editorState.fields[0].value}
                                            </p>
                                        ) : (
                                            editorState.fields.map((field, idx) => (
                                                <div key={field.id} className={editorStyles.entry}>
                                                    <label>Text {idx + 1}</label>
                                                    <input value={field.value} onChange={(e) => editorHandlers.handleFieldChange(idx, e.target.value)} />
                                                    <button className={editorStyles.removeBtn} onClick={() => editorHandlers.handleRemoveField(idx)}>&times;</button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}