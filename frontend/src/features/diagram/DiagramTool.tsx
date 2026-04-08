// frontend/pages/sub4/DiagramTool.jsx

import React from 'react';
import { useState } from 'react';
import ExtractSection from './components/ExtractSection';
import SearchEditSection from './components/SearchEditSection';
import GenSection from './components/GenSection';
import ImageExtractSection from './components/ImageExtractSection';
import PreviewModal from './components/PreviewModal';
import styles from './styles/sub4.module.css';
import '../../styles/base.css';

export default function DiagramTool({
    extractState, searchState, genState, editorState, modalState,
    extractHandlers, searchHandlers, genHandlers, editorHandlers, modalHandlers,
    imageState, imageHandlers,
    initialTab,
}) {
    const [activeService, setActiveService] = useState(initialTab || 'extract');

    return (
        <div className="container">
            <div className="page-header">
                <h1>Visual Tool</h1>
                <p className="subtitle">Extract diagrams & images, search SVGs, and generate with AI</p>
            </div>

            <div className={styles.tabSwitcher}>
                <button
                    className={`${styles.tabBtn} ${activeService === 'extract' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                    onClick={() => setActiveService('extract')}
                >
                    <i className="fas fa-file-import"></i> Extract Diagram
                </button>
                <button
                    className={`${styles.tabBtn} ${activeService === 'images' ? styles.tabBtnActive : styles.tabBtnIdle}`}
                    onClick={() => setActiveService('images')}
                >
                    <i className="fas fa-images"></i> Image Extract
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
                <div key={activeService} className={styles.servicePanelContent}>
                    {activeService === 'extract' && (
                        <ExtractSection extractState={extractState} extractHandlers={extractHandlers} modalHandlers={modalHandlers} />
                    )}

                    {activeService === 'images' && imageState && (
                        <ImageExtractSection imageState={imageState} imageHandlers={imageHandlers} />
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
            </div>

            <PreviewModal modalState={modalState} modalHandlers={modalHandlers} />
        </div>
    );
}