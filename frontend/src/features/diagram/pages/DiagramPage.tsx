import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DiagramToolPage from '../components/DiagramTool';
import HistoryPanel from '../components/HistoryPanel';
import Button from '../../../shared/components/Button/Button';
import Card from '../../../shared/components/Card/Card';
import { useDiagramExtractSearch } from '../hooks/useDiagramExtractSearch';
import { useDiagramGenerate } from '../hooks/useDiagramGenerate';
import { useDiagramImageExtract } from '../hooks/useDiagramImageExtract';
import { transferApi } from '../../chat/api/transferApi';
import * as historyApi from '../api/historyApi';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import s from '../../../styles/history.module.css';
import styles from '../styles/diagram.module.css';

const BASE_URL = 'http://localhost:5009';

/** Normalise an image entry – may be a plain string or {src: '…'} object. */
const toSrc = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && 'src' in v) return String((v as any).src ?? '');
    return '';
};

export default function DiagramPage() {
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
                const { file } = await transferApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;

                const targetTab = tab === 'images' ? 'images' : 'extract';
                setInitialTab(targetTab);

                if (targetTab === 'images') {
                    await imageHandlers.handleTransferFile(file);
                } else {
                    await extractHandlers.handleTransferFile(file);
                }

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
        downloadImage: async () => {
            try {
                const resp = await fetch(modal.imgSrc, { mode: 'cors' });
                const blob = await resp.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `extracted_page_${modal.pageNum || 'img'}.png`;
                a.click();
                URL.revokeObjectURL(blobUrl);
            } catch {
                window.open(modal.imgSrc, '_blank');
            }
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

    const handleReplay = async (item: any) => {
        // Switch to workflow view immediately
        setActiveView('workflow');

        try {
            const detail = await historyApi.getGenerationDetail(item.id);
            const tool = String(item.tool || item.params?.service_type || '').toLowerCase();

            let parsed: any = null;
            try { parsed = JSON.parse((detail as any).result || '{}'); } catch { /* ignore */ }

            if (tool === 'extract_diagram' || tool === 'extract') {
                // Restore extracted diagrams result
                const images = (parsed?.images || []).map(toSrc).filter(Boolean);
                const fakeData = {
                    file: {
                        original_name: item.params?.source_filename || 'unknown',
                        extracted_count: images.length || (parsed?.extracted_count ?? 0),
                    },
                    extracted: images.map((url: string, idx: number) => ({
                        page: idx + 1,
                        data: url.startsWith('/') ? `${BASE_URL}${url}` : url,
                    })),
                };
                setInitialTab('extract');
                extractHandlers.injectExtractResult(fakeData);

            } else if (tool === 'extract_pdf_images') {
                // Restore image-extract result
                const images = (parsed?.images || []).map(toSrc).filter(Boolean);
                const chapterName = item.params?.source_filename || 'Extracted Images';
                const fakeChapters: Record<string, any[]> = {
                    [chapterName]: images.map((url: string, idx: number) => ({
                        src: url.startsWith('/') ? `${BASE_URL}${url}` : url,
                        index: idx,
                        chapter: chapterName,
                        summary: 'Restored from history',
                        caption: `Image ${idx + 1}`,
                    })),
                };
                setInitialTab('images');
                imageHandlers.injectImageResult(fakeChapters, `✅ Restored ${images.length} images from history.`);

            } else if (tool === 'generate' || tool === 'ai_generate') {
                // Restore generate tab with prompt pre-filled
                const prompt = item.params?.prompt || item.params?.input_prompt || '';
                setInitialTab('generate');
                genHandlers.injectGenText(prompt);
            }
        } catch (err) {
            console.error('Replay failed:', err);
        }
    };

    return (
        <div className="container">
            <WelcomeBanner
                title="Visual Tool"
                subtitle="Extract diagrams & images, search SVGs, and generate with AI"
                className={styles.diagramBanner}
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
                    viewSwitchSlot={null}
                    hideBanner
                />
            )}
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel onReplay={handleReplay} />
                </Card>
            )}
        </div>
    );
}
