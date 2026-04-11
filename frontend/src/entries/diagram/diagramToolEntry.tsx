// frontend/entries/diagram/diagramToolEntry.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DiagramToolPage from '../../features/diagram/DiagramTool';
import HistoryPanel from '../../features/diagram/components/HistoryPanel';
import Button from '../../shared/components/Button/Button';
import Card from '../../shared/components/Card/Card';
import { useDiagramExtractSearch } from '../../features/diagram/hooks/useDiagramExtractSearch';
import { useDiagramGenerate } from '../../features/diagram/hooks/useDiagramGenerate';
import { useDiagramImageExtract } from '../../features/diagram/hooks/useDiagramImageExtract';
import { chatApi } from '../../api/chatApi';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import s from '../../styles/history.module.css';

export default function DiagramToolEntry() {
    const { extractState, extractHandlers, searchState, searchHandlers, editorState, editorHandlers } = useDiagramExtractSearch();
    const { genState, genHandlers } = useDiagramGenerate();
    const { imageState, imageHandlers } = useDiagramImageExtract();

    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');
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
                    // Feed file to image extract handler and auto-run extraction
                    await imageHandlers.handleTransferFile(file);
                } else {
                    // Feed file to extract handler and auto-run extraction
                    await extractHandlers.handleTransferFile(file);
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

    const viewSwitchJSX = (
        <div className={s.viewSwitch}>
            <Button type="button" variant={activeView === 'workflow' ? 'primary' : 'outline'} onClick={() => setActiveView('workflow')}>
                <i className="fas fa-project-diagram" /> Workflow
            </Button>
            <Button type="button" variant={activeView === 'history' ? 'primary' : 'outline'} onClick={() => setActiveView('history')}>
                <i className="fas fa-history" /> History
            </Button>
        </div>
    );

    return (
        <div className="container">
            <WelcomeBanner
                title="Visual Tool"
                subtitle="Extract diagrams & images, search SVGs, and generate with AI"
            />
            {viewSwitchJSX}
            {activeView === 'workflow' && (
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
                    hideBanner
                />
            )}
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel onReplay={() => setActiveView('workflow')} />
                </Card>
            )}
        </div>
    );
}
