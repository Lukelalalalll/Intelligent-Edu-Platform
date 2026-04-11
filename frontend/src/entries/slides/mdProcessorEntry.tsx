import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { chatApi } from '../../api/chatApi';
import MdProcessorPage from '../../features/slides/pages/MdProcessorPage';
import HistoryPanel from '../../features/slides/components/HistoryPanel';
import Button from '../../shared/components/Button/Button';
import Card from '../../shared/components/Card/Card';
import { useMdProcessorUpload } from '../../features/slides/hooks/useMdProcessorUpload';
import { useMdProcessorTextInput } from '../../features/slides/hooks/useMdProcessorTextInput';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import mdStyles from '../../features/slides/styles/md_processor.module.css';
import s from '../../styles/history.module.css';

export default function MdProcessorEntry() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const transferConsumedRef = useRef(false);
    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');

    const upload = useMdProcessorUpload();
    const textInput = useMdProcessorTextInput();

    // Transfer auto-consumption: when redirected here with a transfer_id, auto-download and process
    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId || transferConsumedRef.current) return;
        transferConsumedRef.current = true;

        (async () => {
            try {
                const { file: transferFile } = await chatApi.transferConsumeAndDownload(transferId);
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
        // Upload / file props
        file: upload.file,
        useLLM: upload.useLLM,
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
        handleDragOver: upload.handleDragOver,
        handleDragLeave: upload.handleDragLeave,
        handleDrop: upload.handleDrop,
        onFileChange: upload.onFileChange,
        clearFile: upload.clearFile,
        handleUpload: upload.handleUpload,
        handleCheckboxChange: upload.handleCheckboxChange,
        combineSections: (redirectUrl: string) => upload.combineSections(redirectUrl, navigate),
        proceedWithFullDoc: (redirectUrl: string) => upload.proceedWithFullDoc(redirectUrl, navigate),
        // Text input props
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
        handleProcessText: (redirectUrl: string) =>
            textInput.handleProcessText(redirectUrl, navigate, upload.setErrorMsg),
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

    return (
        <div className="container">
            <WelcomeBanner
                title={<><i className="fas fa-file-alt" aria-hidden="true"></i> Markdown File Processor</>}
                subtitle="Process and enhance your PDF and Markdown files with intelligent section extraction"
                className={mdStyles.pageHeader}
                as="header"
            />
            {viewSwitchJSX}
            {activeView === 'workflow' && <MdProcessorPage {...pageProps} hideBanner />}
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel onReplay={() => setActiveView('workflow')} />
                </Card>
            )}
        </div>
    );
}
