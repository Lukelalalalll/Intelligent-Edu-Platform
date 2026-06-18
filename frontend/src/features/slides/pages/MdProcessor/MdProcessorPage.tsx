import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { transferApi } from '../../../chat/api/transferApi';
import MdProcessorView from './MdProcessorView';
import HistoryPanel from './components/HistoryPanel';
import Button from '../../../../shared/components/Button/Button';
import Card from '../../../../shared/components/Card/Card';
import { useMdProcessorUpload } from './hooks/useMdProcessorUpload';
import { useMdProcessorTextInput } from './hooks/useMdProcessorTextInput';
import mdStyles from './styles/mdProcessor.module.css';
import s from '../../../../styles/history.module.css';
import PptGeneratorShell from '../../components/PptGeneratorShell';
import { loadMdProcessorWizardState, saveMdProcessorWizardState } from './hooks/mdProcessorWizardState';

export default function MdProcessor() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const transferConsumedRef = useRef(false);
    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');
    const hydrationRef = useRef(false);
    const [hydrationReady, setHydrationReady] = useState(false);

    const upload = useMdProcessorUpload();
    const textInput = useMdProcessorTextInput();

    useEffect(() => {
        const state = loadMdProcessorWizardState();
        if (!hydrationRef.current && state) {
            hydrationRef.current = true;
            setActiveView(state.activeView || 'workflow');
            textInput.setInputMode(state.inputMode || 'file');
            textInput.setTextContent(state.textContent || '');
            textInput.setTextTitle(state.textTitle || '');
            textInput.setSeedContent(state.seedContent || '');
            textInput.setProvider(state.provider || 'local_ollama');
            upload.hydrateState({
                currentFilename: state.currentFilename || '',
                headers: state.headers || [],
                selectedIndices: state.selectedIndices || [],
                useLLM: Boolean(state.useLLM),
                headerLlmProvider: state.headerLlmProvider || 'local_ollama',
            });
        }
        setHydrationReady(true);
    }, []);

    useEffect(() => {
        if (!hydrationReady) return;
        saveMdProcessorWizardState({
            activeView,
            inputMode: textInput.inputMode,
            textContent: textInput.textContent,
            textTitle: textInput.textTitle,
            seedContent: textInput.seedContent,
            provider: textInput.provider,
            currentFilename: upload.currentFilename,
            headers: upload.headers,
            selectedIndices: upload.selectedIndices,
            useLLM: upload.useLLM,
            headerLlmProvider: upload.headerLlmProvider,
        });
    }, [
        activeView,
        textInput.inputMode,
        textInput.textContent,
        textInput.textTitle,
        textInput.seedContent,
        textInput.provider,
        upload.currentFilename,
        upload.headers,
        upload.selectedIndices,
        upload.useLLM,
        upload.headerLlmProvider,
        hydrationReady,
    ]);

    // Transfer auto-consumption
    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId || transferConsumedRef.current) return;
        transferConsumedRef.current = true;

        (async () => {
            try {
                const { file: transferFile } = await transferApi.transferConsumeAndDownload(transferId);
                upload.setFile(transferFile);
                upload.setErrorMsg('');
                await upload.processFile(transferFile);
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete('transfer_id');
                    return next;
                }, { replace: true });
            } catch (err) {
                console.error('[Transfer] consume failed', err);
                upload.setErrorMsg('Failed to load transferred file');
            }
        })();
    }, [searchParams, setSearchParams, upload]);

    const pageProps = {
        file: upload.file,
        useLLM: upload.useLLM,
        headerLlmProvider: upload.headerLlmProvider,
        isDragging: upload.isDragging,
        uploadStatus: upload.uploadStatus,
        uploadProgress: upload.uploadProgress,
        headers: upload.headers,
        selectedIndices: upload.selectedIndices,
        loading: upload.loading,
        errorMsg: upload.errorMsg,
        currentFilename: upload.currentFilename,
        fileInputRef: upload.fileInputRef,
        setUseLLM: upload.setUseLLM,
        setHeaderLlmProvider: upload.setHeaderLlmProvider,
        handleDragOver: upload.handleDragOver,
        handleDragLeave: upload.handleDragLeave,
        handleDrop: upload.handleDrop,
        onFileChange: upload.onFileChange,
        clearFile: upload.clearFile,
        handleUpload: upload.handleUpload,
        handleCheckboxChange: upload.handleCheckboxChange,
        combineSections: async (redirectUrl: string) => {
            if (textInput.textContent) {
                localStorage.setItem('slidesContentMD', textInput.textContent);
            }
            upload.combineSections(redirectUrl, navigate);
        },
        proceedWithFullDoc: async (redirectUrl: string) => {
            if (textInput.textContent) {
                localStorage.setItem('slidesContentMD', textInput.textContent);
            }
            upload.proceedWithFullDoc(redirectUrl, navigate);
        },
        inputMode: textInput.inputMode,
        setInputMode: textInput.setInputMode,
        textContent: textInput.textContent,
        setTextContent: textInput.setTextContent,
        textTitle: textInput.textTitle,
        setTextTitle: textInput.setTextTitle,
        seedContent: textInput.seedContent,
        setSeedContent: textInput.setSeedContent,
        cozeLoading: textInput.cozeLoading,
        cozeError: textInput.cozeError,
        textProcessing: textInput.textProcessing,
        provider: textInput.provider,
        setProvider: textInput.setProvider,
        handleCozeGenerate: textInput.handleCozeGenerate,
        handleProcessText: async (redirectUrl: string) => {
            localStorage.setItem('slidesContentMD', textInput.textContent);
            textInput.handleProcessText(redirectUrl, navigate, upload.setErrorMsg);
        },
    };

    const viewSwitchJSX = (
        <div className={s.viewSwitch}>
            <Button type="button" variant={activeView === 'workflow' ? 'primary' : 'outline'} onClick={() => setActiveView('workflow')}>
                <i className="fas fa-file-powerpoint" /> Workflow
            </Button>
            <Button type="button" variant={activeView === 'history' ? 'primary' : 'outline'} onClick={() => setActiveView('history')}>
                <i className="fas fa-history" /> History
            </Button>
        </div>
    );

    const workflowContent = (
        <MdProcessorView {...pageProps} hideBanner viewSwitchSlot={null} />
    );

    return (
        <PptGeneratorShell className="container" currentStep={0} toolbar={viewSwitchJSX} contentClassName={mdStyles.pageContent}>
            {activeView === 'workflow' && workflowContent}
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel onReplay={() => setActiveView('workflow')} />
                </Card>
            )}
        </PptGeneratorShell>
    );
}
