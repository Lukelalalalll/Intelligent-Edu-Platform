import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DiagramToolPage from '../components/DiagramTool';
import DiagramCopilotPanel from '../components/DiagramCopilotPanel';
import HistoryPanel from '../components/HistoryPanel';
import Button from '../../../shared/components/Button/Button';
import Card from '../../../shared/components/Card/Card';
import { useDiagramExtractSearch } from '../hooks/useDiagramExtractSearch';
import { useDiagramGenerate } from '../hooks/useDiagramGenerate';
import { useDiagramImageExtract } from '../hooks/useDiagramImageExtract';
import { transferApi } from '../../chat/api/transferApi';
import * as historyApi from '../api/historyApi';
import { resolveApiRoot } from '@/shared/api/root';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import s from '../../../styles/history.module.css';
import styles from '../styles/diagram.module.css';

const BASE_URL = resolveApiRoot();
type DiagramService = 'extract' | 'images' | 'search' | 'generate';

/** Normalise an image entry – may be a plain string or {src: '…'} object. */
const toSrc = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && 'src' in v) return String((v as any).src ?? '');
    return '';
};

export default function DiagramPage() {
    const isEntranceActive = usePageEntrance();
    const { extractState, extractHandlers, searchState, searchHandlers, editorState, editorHandlers } = useDiagramExtractSearch();
    const { genState, genHandlers } = useDiagramGenerate();
    const { imageState, imageHandlers } = useDiagramImageExtract();

    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');
    const [activeService, setActiveService] = useState<DiagramService>('extract');
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
                setActiveService(targetTab);

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
                setActiveService('extract');
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
                setActiveService('images');
                imageHandlers.injectImageResult(fakeChapters, `✅ Restored ${images.length} images from history.`);

            } else if (tool === 'diagram_assistant' || tool === 'assistant') {
                const uiElements = Array.isArray(parsed?.ui_elements) ? parsed.ui_elements : [];
                uiElements.forEach((element: any) => handleCopilotUiElement(element));

            } else if (tool === 'generate' || tool === 'ai_generate') {
                // Restore generate tab with prompt pre-filled
                const prompt = item.params?.prompt || item.params?.input_prompt || '';
                setInitialTab('generate');
                setActiveService('generate');
                genHandlers.injectGenText(prompt);
            }
        } catch (err) {
            console.error('Replay failed:', err);
        }
    };

    const workspaceState = useMemo(() => {
        const compactImage = (item: any, index: number, chapter = '') => {
            const src = toSrc(item?.src || item?.data || item?.url || item);
            return {
                src: src.startsWith('data:') ? '' : src,
                caption: item?.caption || item?.title || '',
                summary: item?.summary || '',
                chapter: item?.chapter || chapter || '',
                page: item?.page || item?.pageNum || '',
                index: item?.index ?? index,
            };
        };

        const extractData = (extractState.data || {}) as any;
        const extractedFromDiagram = Array.isArray(extractData?.extracted)
            ? extractData.extracted.map((item: any, index: number) => compactImage(item, index))
            : [];
        const imagesByChapter = (imageState.imagesByChapter || {}) as Record<string, any[]>;
        const extractedFromImages = Object.entries(imagesByChapter).flatMap(([chapter, items]) =>
            (Array.isArray(items) ? items : []).map((item, index) => compactImage(item, index, chapter)),
        );
        const selectedImages = Array.isArray(imageState.selectedImages)
            ? imageState.selectedImages.map((item: any, index: number) => compactImage(item, index))
            : [];
        const currentSvg = String((editorState as any).currentSvg || (genState.data as any)?.svg || '');

        return {
            current_svg: currentSvg,
            extracted_images: [...extractedFromDiagram, ...extractedFromImages].slice(0, 30),
            selected_images: selectedImages.slice(0, 20),
        };
    }, [editorState, extractState.data, genState.data, imageState.imagesByChapter, imageState.selectedImages]);

    const handleCopilotProviderChange = (provider: any) => {
        genHandlers.setProvider?.(provider);
        imageHandlers.setAiProvider?.(provider);
    };

    function handleCopilotUiElement(element: any) {
        const targetTab = element?.target_tab;
        if (['extract', 'images', 'search', 'generate'].includes(targetTab)) {
            setActiveService(targetTab);
        }

        if (element?.type === 'diagram_svg' && element.svg) {
            setActiveService('generate');
            genHandlers.injectGeneratedSvg?.(element.svg, element.meta || {}, element.prompt || '');
        } else if (element?.type === 'svg_search_results') {
            setActiveService('search');
            searchHandlers.injectSearchResults?.(element.results || [], element.query || '');
        } else if (element?.type === 'edited_svg' && element.svg) {
            setActiveService('search');
            editorHandlers.injectEditedSvg?.(element.svg);
        } else if (element?.type === 'ai_images') {
            setActiveService('images');
            imageHandlers.injectAiImages?.(element.images || [], element.prompt || '', element.meta || null);
        } else if (element?.type === 'expanded_brief') {
            setActiveService('generate');
            genHandlers.setInputMode?.('text');
            genHandlers.setAiDescription?.(element.text || '');
        } else if (element?.type === 'document_extract_notice' || element?.type === 'extracted_summary') {
            setActiveService('extract');
        }
    }

    return (
        <div className={`container ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                title="Visual Tool"
                subtitle="Extract diagrams & images, search SVGs, and generate with AI"
                className={styles.diagramBanner}
                variant="workspace"
            />
            {viewSwitchJSX}
            {activeView === 'workflow' && (
                <div className={styles.diagramWorkbench}>
                    <div className={styles.diagramWorkbenchMain}>
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
                            activeService={activeService}
                            onActiveServiceChange={setActiveService}
                            viewSwitchSlot={null}
                            hideBanner
                        />
                    </div>
                    <DiagramCopilotPanel
                        provider={genState.provider}
                        onProviderChange={handleCopilotProviderChange}
                        activeService={activeService}
                        onActiveServiceChange={setActiveService}
                        workspaceState={workspaceState}
                        onUiElement={handleCopilotUiElement}
                    />
                </div>
            )}
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel onReplay={handleReplay} />
                </Card>
            )}
        </div>
    );
}
