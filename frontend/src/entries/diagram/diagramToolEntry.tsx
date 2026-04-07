// frontend/entries/diagram/diagramToolEntry.tsx
import React, { useState } from 'react';
import DiagramToolPage from '../../features/diagram/DiagramTool';
import { useDiagramExtractSearch } from './hooks/useDiagramExtractSearch';
import { useDiagramGenerate } from './hooks/useDiagramGenerate';
import { useDiagramImageExtract } from './hooks/useDiagramImageExtract';

export default function DiagramToolEntry() {
    const { extractState, extractHandlers, searchState, searchHandlers, editorState, editorHandlers } = useDiagramExtractSearch();
    const { genState, genHandlers } = useDiagramGenerate();
    const { imageState, imageHandlers } = useDiagramImageExtract();

    const [modal, setModal] = useState({ isOpen: false, imgSrc: '', pageNum: '' });

    const modalHandlers = {
        openModal: (imgSrc: string, pageNum: string) => {
            setModal({ isOpen: true, imgSrc, pageNum });
            document.body.style.overflow = 'hidden';
        },
        closeModal: () => {
            setModal({ isOpen: false, imgSrc: '', pageNum: '' });
            document.body.style.overflow = '';
        },
        downloadImage: () => {
            const a = document.createElement('a');
            a.href = modal.imgSrc;
            a.download = `extracted_page_${modal.pageNum || 'img'}.png`;
            a.click();
        },
    };

    return (
        <DiagramToolPage
            extractState={extractState}
            extractHandlers={extractHandlers}
            searchState={searchState}
            searchHandlers={searchHandlers}
            genState={genState}
            genHandlers={genHandlers}
            editorState={editorState}
            editorHandlers={editorHandlers}
            modalState={modal}
            modalHandlers={modalHandlers}
            imageState={imageState}
            imageHandlers={imageHandlers}
        />
    );
}
