import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { transferApi } from '../../../chat/api/transferApi';
import { useThemeConfig } from './hooks/useThemeConfig';
import AIThemeConfigView from './AIThemeConfigView';
import client from '@/shared/api/client';
import { useMdProcessorUpload, type MdProcessorResolvedContent } from '../MdProcessor/hooks/useMdProcessorUpload';
import { useMdProcessorTextInput, type MdProcessorTextResult } from '../MdProcessor/hooks/useMdProcessorTextInput';
import { loadMdProcessorWizardState, saveMdProcessorWizardState } from '../MdProcessor/hooks/mdProcessorWizardState';
import Button from '../../../../shared/components/Button/Button';
import styles from './styles/aiThemeConfig.module.css';

function resolveInlineTitle(source: MdProcessorResolvedContent | MdProcessorTextResult, fallbackTitle: string): string {
  const filenameTitle = source.filename.replace(/\.[^/.]+$/, '').trim();
  const explicitTitle = 'title' in source ? source.title?.trim() : '';
  return fallbackTitle.trim() || explicitTitle || filenameTitle || 'Presentation';
}

export default function AIThemeConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const transferConsumedRef = useRef(false);
  const hydrationRef = useRef(false);
  const [hydrationReady, setHydrationReady] = useState(false);
  const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');
  const [sourceContent, setSourceContent] = useState('');
  const [fetching, setFetching] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const themeConfig = useThemeConfig();
  const upload = useMdProcessorUpload();
  const textInput = useMdProcessorTextInput();

  useEffect(() => {
    const state = loadMdProcessorWizardState();
    if (!hydrationRef.current && state) {
      hydrationRef.current = true;
      setActiveView(state.activeView || 'workflow');
      setCurrentStep(typeof state.currentStep === 'number' ? state.currentStep : 0);
      textInput.setInputMode(state.inputMode || 'file');
      textInput.setTextContent(state.textContent || '');
      textInput.setTextTitle(state.textTitle || '');
      textInput.setSeedContent(state.seedContent || '');
      textInput.setProvider(state.provider || 'local_ollama');
      upload.hydrateState({
        currentFilename: state.currentFilename || '',
        currentDisplayFilename: state.currentDisplayFilename || '',
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
      currentStep,
      inputMode: textInput.inputMode,
      textContent: textInput.textContent,
      textTitle: textInput.textTitle,
      seedContent: textInput.seedContent,
      provider: textInput.provider,
      currentFilename: upload.currentFilename,
      currentDisplayFilename: upload.currentDisplayFilename,
      headers: upload.headers,
      selectedIndices: upload.selectedIndices,
      useLLM: upload.useLLM,
      headerLlmProvider: upload.headerLlmProvider,
    });
  }, [
    activeView,
    currentStep,
    hydrationReady,
    textInput.inputMode,
    textInput.textContent,
    textInput.textTitle,
    textInput.seedContent,
    textInput.provider,
    upload.currentFilename,
    upload.currentDisplayFilename,
    upload.headers,
    upload.selectedIndices,
    upload.useLLM,
    upload.headerLlmProvider,
  ]);

  useEffect(() => {
    const storedContent = localStorage.getItem('slidesContentMD');
    if (storedContent) {
      setSourceContent(storedContent);
      localStorage.removeItem('slidesContentMD');
      if (currentStep < 1) setCurrentStep(1);
      if (!themeConfig.markdownDraft) {
        themeConfig.replaceSourceDraft(storedContent, themeConfig.title);
      }
      return;
    }

    const filename = localStorage.getItem('combinedFilename');
    if (!filename) return;

    setFetching(true);
    client
      .get(`/slides/download/${filename}`)
      .then((res) => {
        const text = typeof res.data === 'string' ? res.data : res.data?.content || '';
        setSourceContent(text);
        if (text.trim() && !themeConfig.markdownDraft) {
          themeConfig.replaceSourceDraft(text, themeConfig.title);
        }
      })
      .catch(() => {
        themeConfig.setErrorMsg(
          'Failed to load document content. The file may have expired. Please go back and re-upload your document.',
        );
      })
      .finally(() => setFetching(false));
  }, []);

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

  useEffect(() => {
    if (themeConfig.workflowStage === 'configure' || themeConfig.workflowStage === 'generating') {
      setCurrentStep(1);
      return;
    }
    if (themeConfig.workflowStage === 'markdown') {
      setCurrentStep(2);
      return;
    }
    if (themeConfig.workflowStage === 'editing' || themeConfig.workflowStage === 'exporting') {
      setCurrentStep(3);
      return;
    }
    if (themeConfig.workflowStage === 'complete') {
      setCurrentStep(4);
    }
  }, [themeConfig.workflowStage]);

  const applyResolvedSource = (resolved: MdProcessorResolvedContent | MdProcessorTextResult | null) => {
    if (!resolved?.content.trim()) return;
    const nextTitle = resolveInlineTitle(resolved, textInput.textTitle || themeConfig.title);
    setSourceContent(resolved.content);
    themeConfig.replaceSourceDraft(resolved.content, nextTitle);
    setCurrentStep(1);
    setActiveView('workflow');
  };

  const mdProcessorViewProps = {
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
    currentDisplayFilename: upload.currentDisplayFilename,
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
    combineSections: async () => {
      const resolved = await upload.combineSectionsInline();
      applyResolvedSource(resolved);
    },
    proceedWithFullDoc: async () => {
      const resolved = await upload.proceedWithFullDocInline();
      applyResolvedSource(resolved);
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
    cozeError: textInput.cozeError || textInput.processError,
    textProcessing: textInput.textProcessing,
    provider: textInput.provider,
    setProvider: textInput.setProvider,
    handleCozeGenerate: textInput.handleCozeGenerate,
    handleProcessText: async () => {
      const resolved = await textInput.processTextInline();
      applyResolvedSource(resolved);
    },
    viewSwitchSlot: null,
    hideBanner: true,
    bannerTitle: undefined,
    bannerSubtitle: undefined,
    continueLabel: undefined,
    quickContinueLabel: undefined,
  };

  const stepperLeading = useMemo(() => (
    <div className={styles.topRailViewSwitch} aria-label="View switch">
      <Button
        type="button"
        variant={activeView === 'workflow' ? 'primary' : 'ghost'}
        className={styles.topRailViewSwitchButton}
        onClick={() => setActiveView('workflow')}
      >
        <i className="fas fa-file-powerpoint" /> Workflow
      </Button>
      <Button
        type="button"
        variant={activeView === 'history' ? 'primary' : 'ghost'}
        className={styles.topRailViewSwitchButton}
        onClick={() => setActiveView('history')}
      >
        <i className="fas fa-history" /> History
      </Button>
    </div>
  ), [activeView]);

  return (
    <AIThemeConfigView
      content={sourceContent}
      fetching={fetching}
      activeView={activeView}
      currentStep={currentStep}
      stepperLeading={stepperLeading}
      mdProcessorViewProps={mdProcessorViewProps}
      topRailMode="unified"
      baseTheme={themeConfig.baseTheme}
      setBaseTheme={themeConfig.setBaseTheme}
      title={themeConfig.title}
      setTitle={themeConfig.setTitle}
      userCustomThemePrompt={themeConfig.userCustomThemePrompt}
      setUserCustomThemePrompt={themeConfig.setUserCustomThemePrompt}
      workflowStage={themeConfig.workflowStage}
      markdownDraft={themeConfig.markdownDraft ?? sourceContent}
      generationProgress={themeConfig.generationProgress}
      exportProgress={themeConfig.exportProgress}
      errorMsg={themeConfig.errorMsg || upload.errorMsg}
      result={themeConfig.result}
      exportResult={themeConfig.exportResult}
      draftSlides={themeConfig.draftSlides}
      previewResult={themeConfig.previewResult}
      previewLoading={themeConfig.previewLoading}
      providerLoading={themeConfig.providerLoading}
      providerOptions={themeConfig.providerOptions}
      selectedProvider={themeConfig.selectedProvider}
      setSelectedProvider={themeConfig.setSelectedProvider}
      selectedProviderMeta={themeConfig.selectedProviderMeta}
      openMarkdownDraft={themeConfig.openMarkdownDraft}
      editMarkdownDraft={themeConfig.editMarkdownDraft}
      commitMarkdownDraft={themeConfig.commitMarkdownDraft}
      generate={(finalTitle?: string) => themeConfig.generate(
        themeConfig.markdownDraft ?? sourceContent,
        finalTitle,
        {
          sourceKind: textInput.inputMode === 'file' ? 'upload' : 'text',
          sourceFilename: upload.currentFilename,
          sourceDisplayName: upload.currentDisplayFilename || upload.currentFilename,
          combinedMarkdownFilename: localStorage.getItem('combinedFilename') || '',
        },
      )}
      exportDraft={themeConfig.exportDraft}
      resetToConfigure={themeConfig.resetToConfigure}
      returnToEditing={themeConfig.returnToEditing}
      updateSlide={themeConfig.updateSlide}
      updateBullets={themeConfig.updateBullets}
      setSlideLayout={themeConfig.setSlideLayout}
      onReturnToPrepare={() => {
        setCurrentStep(0);
        themeConfig.resetToConfigure();
      }}
      onHistoryReplay={() => setActiveView('workflow')}
    />
  );
}
