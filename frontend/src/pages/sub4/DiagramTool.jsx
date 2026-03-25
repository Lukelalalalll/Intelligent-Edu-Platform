// frontend/pages/sub4/DiagramTool.jsx

import React from 'react';
import { useState } from 'react';
import ExtractSection from './components/ExtractSection';
import SearchEditSection from './components/SearchEditSection';
import GenSection from './components/GenSection';
import PreviewModal from './components/PreviewModal';
import styles from '../../styles/sub4/sub4.module.css';
import '../../styles/base.css';

export default function DiagramTool({
    extractState, searchState, genState, editorState, modalState,
    extractHandlers, searchHandlers, genHandlers, editorHandlers, modalHandlers
}) {
    const [activeService, setActiveService] = useState('extract');

    return (
        <div className="container">
            <div className="page-header">
                <h1>Diagram Tool</h1>
                <p className="subtitle">Create, edit and generate diagrams with AI assistance</p>
            </div>

            <div className={styles.tabSwitcher}>
                <button
                    className={`${styles.tabBtn} ${activeService === 'extract' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                    onClick={() => setActiveService('extract')}
                >
                    <i className="fas fa-file-import"></i> Extract Diagram
                </button>
                <button
                    className={`${styles.tabBtn} ${activeService === 'search' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                    onClick={() => setActiveService('search')}
                >
                    <i className="fas fa-search"></i> Search & Edit SVG
                </button>
                <button
                    className={`${styles.tabBtn} ${activeService === 'generate' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                    onClick={() => setActiveService('generate')}
                >
                    <i className="fas fa-wand-magic-sparkles"></i> AI Generate
                </button>
            </div>

            <div className={styles.servicePanel}>
                {activeService === 'extract' && (
                    <ExtractSection extractState={extractState} extractHandlers={extractHandlers} modalHandlers={modalHandlers} />
                )}

                {activeService === 'search' && (
                    <SearchEditSection
                        searchState={searchState}
                        searchHandlers={searchHandlers}
                        editorState={editorState}
                        editorHandlers={editorHandlers}
                    />
                )}

                {activeService === 'generate' && (
                    <GenSection genState={genState} genHandlers={genHandlers} />
                )}
            </div>

            <PreviewModal modalState={modalState} modalHandlers={modalHandlers} />
        </div>
    );
}