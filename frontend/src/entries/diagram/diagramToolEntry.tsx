// frontend/entries/diagram/diagramToolEntry.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DiagramToolPage from '../../features/diagram/DiagramTool';
import { useDiagramExtractSearch } from './hooks/useDiagramExtractSearch';
import { useDiagramGenerate } from './hooks/useDiagramGenerate';
import { useDiagramImageExtract } from './hooks/useDiagramImageExtract';
import { chatApi } from '../../api/chatApi';

export default function DiagramToolEntry() {
    const { extractState, extractHandlers, searchState, searchHandlers, editorState, editorHandlers } = useDiagramExtractSearch();
    const { genState, genHandlers } = useDiagramGenerate();
    const { imageState, imageHandlers } = useDiagramImageExtract();

    const [modal, setModal] = useState({ isOpen: false, imgSrc: '', pageNum: '' });
    const [searchParams, setSearchParams] = useSearchParams();
    const [initialTab, setInitialTab] = useState<string | undefined>(undefined);

    // Transfer ticket auto-consumption
    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        const tab = searchParams.get('tab');
        if (!transferId) return;

        let cancelled = false;
        (async () => {
            try {
                const { file } = await chatApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;

                // Determine which tab to target (default: extract)
                const targetTab = tab === 'images' ? 'images' : 'extract';
                setInitialTab(targetTab);

                if (targetTab === 'images') {
                    // Feed file to image extract handler
                    imageHandlers.handleFileInput({ target: { files: [file], value: '' } });
                } else {
                    // Feed file to extract handler
                    extractHandlers.handleFileChange({ target: { files: [file] } });
                }

                // Clean up URL params
                searchParams.delete('transfer_id');
                searchParams.delete('tab');
                setSearchParams(searchParams, { replace: true });
            } catch (err) {
                console.error('Transfer consume failed:', err);
            }
        })();

        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            initialTab={initialTab}
        />
    );
}
