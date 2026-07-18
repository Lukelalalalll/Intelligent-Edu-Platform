import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useToast } from '@/shared/hooks/useToast';
import type { QuestionDraft } from '@/types/api';

import { transferApi } from '../../chat/api/transferApi';
import {
    exportQuestionSelection,
    finalizeQuestionHistory,
    getGenerationDetail,
    getGenerationHistory,
    streamGenerateQuestions,
    uploadFile,
    type QuestionGenerationStreamEvent,
} from '../api/questionBankApi';
import { openQuestionPdfExport } from '../exportQuestionPdf';
import {
    formatQuestionProviderSource,
    isQuestionProviderReady,
    resolveQuestionProvider,
    type QuestionStudioProvider,
} from '../questionProviderConfig';
import { buildQuestionsMarkdown, normalizeQuestionDraft } from '../questionDraftUtils';
import { downloadBlob } from '../utils/downloadBlob';
import { formatPageRangeSummary, parsePageSelectionInput } from '../utils/pageSelection';
import type {
    HistoryState,
    QuestionExportFormat,
    QuestionGeneratorController,
    StudioView,
    WorkspaceStep,
} from './questionGeneratorTypes';
import { useQuestionDraftActions } from './useQuestionDraftActions';
import { useQuestionGeneratorProviders } from './useQuestionGeneratorProviders';

export type {
    HistoryState,
    QuestionExportFormat,
    QuestionGeneratorController,
    StudioView,
    WorkspaceStep,
} from './questionGeneratorTypes';

const READY_MESSAGE = 'Ready to generate.';

export function useQuestionGenerator(): QuestionGeneratorController {
    const { toasts, showToast, removeToast } = useToast();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const streamAbortRef = useRef<AbortController | null>(null);

    const [view, setView] = useState<StudioView>('hub');
    const [workspaceStep, setWorkspaceStep] = useState<WorkspaceStep>('start');
    const [historyState, setHistoryState] = useState<HistoryState>({ items: [], loading: true });
    const [sourceText, setSourceText] = useState('');
    const [questionType, setQuestionType] = useState('Multiple choice');
    const [numQuestions, setNumQuestions] = useState(6);
    const [difficulty, setDifficulty] = useState(3);
    const [outputLanguage, setOutputLanguage] = useState('English');
    const [constraints, setConstraints] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [totalPages, setTotalPages] = useState(0);
    const [useAllPages, setUseAllPages] = useState(true);
    const [pageSelectionInput, setPageSelectionInput] = useState('');
    const [historyId, setHistoryId] = useState<string | null>(null);
    const [streamPhase, setStreamPhase] = useState('idle');
    const [streamMessage, setStreamMessage] = useState(READY_MESSAGE);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSavingHistory, setIsSavingHistory] = useState(false);
    const [questions, setQuestions] = useState<QuestionDraft[]>([]);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
    const [resultProvider, setResultProvider] = useState<QuestionStudioProvider | null>(null);
    const [resultProviderSource, setResultProviderSource] = useState('');
    const [resultEffectiveModel, setResultEffectiveModel] = useState('');
    const {
        providerOptions,
        provider,
        setProvider,
        providerLoading,
        providerError,
        selectedProviderStatus,
        preferredProviderOptions,
        preferredAiConfigOptions,
    } = useQuestionGeneratorProviders(showToast);

    const selectedQuestions = useMemo(
        () => questions.filter((question) => selectedQuestionIds.includes(question.id)),
        [questions, selectedQuestionIds],
    );
    const resultProviderStatus = useMemo(
        () => providerOptions.find((option) => option.id === resultProvider) || null,
        [providerOptions, resultProvider],
    );

    const loadHistory = useCallback(async () => {
        setHistoryState((current) => ({ ...current, loading: true }));
        try {
            const data = await getGenerationHistory(1, 12);
            setHistoryState({ items: Array.isArray(data.items) ? data.items : [], loading: false });
        } catch (error) {
            console.error(error);
            setHistoryState({ items: [], loading: false });
            showToast('Failed to load question history.', 'error');
        }
    }, [showToast]);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    useEffect(() => () => {
        streamAbortRef.current?.abort();
    }, []);

    const resetResultState = useCallback(() => {
        setQuestions([]);
        setSelectedQuestionIds([]);
        setHistoryId(null);
        setStreamPhase('idle');
        setStreamMessage(READY_MESSAGE);
        setResultProvider(null);
        setResultProviderSource('');
        setResultEffectiveModel('');
    }, []);

    const handleUploadedFile = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showToast('V1 only supports PDF upload in Question Studio.', 'warning');
            return;
        }
        setUploading(true);
        try {
            const result = await uploadFile(file);
            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }
            setSelectedFile(file);
            setTaskId(result.task_id);
            setTotalPages(Number(result.total_pages || 0));
            setUseAllPages(true);
            setPageSelectionInput('');
            showToast(`Uploaded ${result.filename}.`, 'success');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Upload failed.', 'error');
        } finally {
            setUploading(false);
        }
    }, [showToast]);

    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId) return undefined;

        let cancelled = false;
        void (async () => {
            try {
                const { file } = await transferApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;
                setView('generate');
                setWorkspaceStep('composer');
                await handleUploadedFile(file);
                const next = new URLSearchParams(searchParams);
                next.delete('transfer_id');
                setSearchParams(next, { replace: true });
            } catch (error) {
                console.error('Transfer consume failed:', error);
                showToast('Failed to import transferred PDF.', 'error');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [handleUploadedFile, searchParams, setSearchParams, showToast]);

    const hydrateHistoryResult = useCallback(async (targetHistoryId: string) => {
        try {
            const detail = await getGenerationDetail(targetHistoryId);
            const sourceDrafts = Array.isArray(detail.question_drafts)
                ? detail.question_drafts
                : Array.isArray(detail.result_data?.questions)
                    ? detail.result_data.questions
                    : [];
            const drafts = sourceDrafts.map((item, index) => normalizeQuestionDraft(item, index));
            if (!drafts.length) {
                showToast('This history item has no structured questions to reopen.', 'warning');
                return;
            }
            const selectedIds = Array.isArray(detail.selected_question_ids)
                ? detail.selected_question_ids
                : detail.result_data?.selected_question_ids;

            setView('generate');
            setWorkspaceStep('result');
            setQuestions(drafts);
            setSelectedQuestionIds(
                Array.isArray(selectedIds) && selectedIds.length > 0
                    ? selectedIds
                    : drafts.map((item) => item.id),
            );
            setHistoryId(targetHistoryId);
            setStreamPhase('complete');
            setStreamMessage('Loaded final version from history.');
            const params = detail.params || {};
            setResultProvider((params.provider_resolved || params.provider || null) as QuestionStudioProvider | null);
            setResultProviderSource(String(params.provider_source || detail.source?.provider_source || ''));
            setResultEffectiveModel(String(params.effective_model || detail.source?.effective_model || ''));
        } catch (error) {
            console.error(error);
            showToast('Failed to open history item.', 'error');
        }
    }, [showToast]);

    const handleStreamEvent = useCallback((event: QuestionGenerationStreamEvent) => {
        if (event.type === 'status') {
            setStreamPhase(event.phase);
            setStreamMessage(event.message);
            return;
        }
        if (event.type === 'question') {
            setQuestions((current) => [...current, normalizeQuestionDraft(event.question, current.length)]);
            return;
        }
        if (event.type === 'complete') {
            const drafts = Array.isArray(event.question_drafts)
                ? event.question_drafts.map((item, index) => normalizeQuestionDraft(item, index))
                : [];
            setQuestions(drafts);
            setSelectedQuestionIds(drafts.map((item) => item.id));
            setHistoryId(event.history_id);
            setTaskId(event.task_id);
            setStreamPhase('complete');
            setStreamMessage('Generation complete. Review and export the questions you want.');
            setResultProvider((event.provider as QuestionStudioProvider) || null);
            setResultProviderSource(String(event.provider_source || ''));
            setResultEffectiveModel(String(event.effective_model || ''));
            return;
        }
        setStreamPhase('error');
        setStreamMessage(event.message);
        showToast(event.message, 'error');
    }, [showToast]);

    const handleGenerate = useCallback(async () => {
        const nextProvider = provider || resolveQuestionProvider(providerOptions);
        const nextProviderStatus = providerOptions.find((option) => option.id === nextProvider) || null;

        if (!nextProvider) {
            showToast('No available AI model found. Configure one in AI Config or check runtime availability.', 'warning');
            return;
        }
        if (!nextProviderStatus || !isQuestionProviderReady(nextProviderStatus)) {
            showToast('The selected AI model is not ready yet. Choose another model or update AI Config.', 'warning');
            return;
        }
        if (!sourceText.trim() && !taskId) {
            showToast('Add source text, upload a PDF, or both.', 'warning');
            return;
        }

        const pageSelection = selectedFile && !useAllPages
            ? parsePageSelectionInput(pageSelectionInput, totalPages)
            : { pages: [] as number[] };
        if (selectedFile && !useAllPages && pageSelection.error) {
            showToast(pageSelection.error, 'warning');
            return;
        }

        streamAbortRef.current?.abort();
        streamAbortRef.current = new AbortController();
        resetResultState();
        setView('generate');
        setWorkspaceStep('result');
        setIsGenerating(true);
        if (nextProvider !== provider) {
            setProvider(nextProvider);
        }

        try {
            await streamGenerateQuestions({
                provider: nextProvider,
                task_id: taskId,
                source_text: sourceText.trim(),
                question_type: questionType,
                num_questions: numQuestions,
                difficulty,
                constraints: constraints
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
                output_language: outputLanguage,
                source_type: 'pdf',
                page_numbers: selectedFile && !useAllPages ? pageSelection.pages : [],
            }, handleStreamEvent, streamAbortRef.current.signal);
            await loadHistory();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Question generation failed.', 'error');
            setStreamPhase('error');
            setStreamMessage('Question generation failed.');
        } finally {
            setIsGenerating(false);
        }
    }, [
        constraints,
        difficulty,
        handleStreamEvent,
        loadHistory,
        numQuestions,
        outputLanguage,
        pageSelectionInput,
        provider,
        providerOptions,
        resetResultState,
        selectedFile,
        setProvider,
        questionType,
        showToast,
        sourceText,
        taskId,
        totalPages,
        useAllPages,
    ]);

    const persistHistory = useCallback(async () => {
        if (!historyId) return;
        setIsSavingHistory(true);
        try {
            await finalizeQuestionHistory(historyId, {
                questions,
                markdown: buildQuestionsMarkdown(questions),
                selected_question_ids: selectedQuestionIds,
            });
        } finally {
            setIsSavingHistory(false);
        }
    }, [historyId, questions, selectedQuestionIds]);

    const handleSaveHistory = useCallback(async () => {
        try {
            await persistHistory();
            showToast('Saved current edits to history.', 'success');
            await loadHistory();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Failed to save history.', 'error');
        }
    }, [loadHistory, persistHistory, showToast]);

    const handleExport = useCallback(async (format: QuestionExportFormat) => {
        if (selectedQuestions.length === 0) {
            showToast('Select at least one question before exporting.', 'warning');
            return;
        }
        try {
            await persistHistory();
            if (format === 'pdf') {
                openQuestionPdfExport(selectedQuestions);
                return;
            }
            const blob = await exportQuestionSelection({
                questions: selectedQuestions,
                format,
                filename: 'question-studio',
            });
            downloadBlob(blob, format === 'markdown' ? 'question-studio.md' : 'question-studio.txt');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Export failed.', 'error');
        }
    }, [persistHistory, selectedQuestions, showToast]);

    const {
        updateQuestion,
        addOption,
        removeOption,
        toggleSelectedQuestion,
    } = useQuestionDraftActions(setQuestions, setSelectedQuestionIds);

    const currentResultLabel = resultProviderStatus?.label || selectedProviderStatus?.label || (resultProvider || provider || 'Provider');
    const currentResultModel = resultEffectiveModel || resultProviderStatus?.model || '';
    const currentResultSource = resultProviderSource || (resultProviderStatus ? formatQuestionProviderSource(resultProviderStatus.source) : '');
    const hasGenerationInput = Boolean(sourceText.trim() || taskId);
    const aiSelectorLabel = preferredAiConfigOptions.length > 0 ? 'AI Model' : 'AI Runtime';
    const streamPhaseLabel = streamPhase.charAt(0).toUpperCase() + streamPhase.slice(1);
    const parsedComposerPageSelection = selectedFile && !useAllPages
        ? parsePageSelectionInput(pageSelectionInput, totalPages)
        : { pages: [] as number[] };
    const pageScopeSummary = !selectedFile
        ? 'No PDF connected'
        : useAllPages
            ? 'All pages'
            : parsedComposerPageSelection.error
                ? 'Choose pages'
                : formatPageRangeSummary(parsedComposerPageSelection.pages);
    const currentStepIndex = workspaceStep === 'start' ? 0 : workspaceStep === 'composer' ? 1 : 2;

    return {
        state: {
            view,
            workspaceStep,
            historyState,
            provider,
            providerLoading,
            providerError,
            sourceText,
            questionType,
            numQuestions,
            difficulty,
            outputLanguage,
            constraints,
            uploading,
            dragActive,
            selectedFile,
            taskId,
            totalPages,
            useAllPages,
            pageSelectionInput,
            historyId,
            streamMessage,
            isGenerating,
            isSavingHistory,
            questions,
            selectedQuestionIds,
        },
        derived: {
            selectedQuestions,
            selectedProviderStatus,
            preferredProviderOptions,
            preferredAiConfigOptions,
            currentResultLabel,
            currentResultModel,
            currentResultSource,
            hasGenerationInput,
            aiSelectorLabel,
            streamPhaseLabel,
            pageScopeSummary,
            currentStepIndex,
        },
        actions: {
            setView,
            setWorkspaceStep,
            setSourceText,
            setQuestionType,
            setNumQuestions,
            setDifficulty,
            setOutputLanguage,
            setConstraints,
            setDragActive,
            setProvider,
            setUseAllPages,
            setPageSelectionInput,
            navigateToAiConfig: () => navigate('/ai-config'),
            handleUploadedFile,
            hydrateHistoryResult,
            handleGenerate,
            handleSaveHistory,
            handleExport,
            updateQuestion,
            addOption,
            removeOption,
            toggleSelectedQuestion,
        },
        toasts,
        removeToast,
    };
}
