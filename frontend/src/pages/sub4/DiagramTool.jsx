// frontend/pages/sub4/DiagramTool.jsx

import React from 'react';
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
    return (
        <div className="container">
            <div className="page-header">
                <h1>Diagram Tool</h1>
                <p className="subtitle">Create, edit and generate diagrams with AI assistance</p>
            </div>

            <ExtractSection extractState={extractState} extractHandlers={extractHandlers} modalHandlers={modalHandlers} />

            <SearchEditSection searchState={searchState} searchHandlers={searchHandlers} editorState={editorState} editorHandlers={editorHandlers} />

            <GenSection genState={genState} genHandlers={genHandlers} />

            <PreviewModal modalState={modalState} modalHandlers={modalHandlers} />
        </div>
    );
}