import React from 'react';
import styles from '../styles/sub4.module.css';

export default function SearchEditSection({ searchState, searchHandlers, editorState, editorHandlers }) {
    return (
        <div className="card">
            <div className="card-header">
                <div className="card-icon"><i className="fas fa-search"></i></div>
                <h4>2. Search & Edit SVG</h4>
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
                                    <img src={item.thumb} alt={item.title} title={item.title} />
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
                    <div className={styles.editor}>
                        {editorState.loading ? (
                            <p><i className="fas fa-spinner fa-spin"></i> Loading SVG editor...</p>
                        ) : editorState.error ? (
                            <p style={{ color: 'red' }}>{editorState.error}</p>
                        ) : (
                            <>
                                <div className={styles.editorButtons}>
                                    <button className={styles.editorBtn} onClick={editorHandlers.applyChanges}><i className="fas fa-check"></i> Apply Changes</button>
                                    <button className={styles.editorBtn} onClick={editorHandlers.downloadSvg}><i className="fas fa-download"></i> Download SVG</button>
                                    <button className={styles.editorBtn} onClick={() => editorHandlers.setIsVisible(false)}><i className="fas fa-times"></i> Close Editor</button>
                                </div>
                                <div className={styles.editorContainer}>
                                    <div className={styles.preview}>
                                        <h3 style={{ padding: '10px', margin: 0, borderBottom: '1px solid #eee' }}>Preview</h3>
                                        <iframe srcDoc={editorState.previewHtml} title="SVG Preview"></iframe>
                                    </div>
                                    <div className={styles.editorFields}>
                                        <h3 style={{ margin: '0 0 10px 0' }}>Editable Text Fields</h3>
                                        {editorState.fields.length === 0 ? (
                                            <p>No editable text fields found in this SVG.</p>
                                        ) : (
                                            editorState.fields.map((field, idx) => (
                                                <div key={field.id} className={styles.entry}>
                                                    <label>Text {idx + 1}</label>
                                                    <input value={field.value} onChange={(e) => editorHandlers.handleFieldChange(idx, e.target.value)} />
                                                    <button className={styles.removeBtn} onClick={() => editorHandlers.handleRemoveField(idx)}>&times;</button>
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