import { useState, useEffect } from 'react';
import * as sub2Api from '../api/questionBankApi';
import { useToast } from '@/shared/hooks/useToast';
import { log } from '@/shared/utils/logger';
import { useStep1Upload } from './useStep1Upload';
import { useStep2Extract } from './useStep2Extract';
import { useStep3Generate } from './useStep3Generate';
import { useQuestionOps } from './useQuestionOps';

export function useQuestionGenerator() {
    const { toasts, showToast, removeToast } = useToast();
    
    // Adapt showToast to match the expected signature for sub-hooks
    const adaptedShowToast = (msg: string, type?: string) => showToast(msg, type as any);

    const [currentStep, setCurrentStep] = useState(() => {
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('sub2_current_step') : null;
        const parsed = Number(saved);
        return [1, 2, 3].includes(parsed) ? parsed : 1;
    });

    // ── Sub-hooks ──────────────────────────────────────────────────────────────
    const step1 = useStep1Upload({ showToast: adaptedShowToast });
    const step2 = useStep2Extract({
        taskId: step1.taskId,
        selectedPages: step1.selectedPages,
        setGenerationSource: step1.setGenerationSource,
        showToast: adaptedShowToast,
    });
    const step3 = useStep3Generate({
        taskId: step1.taskId,
        generationSource: step1.generationSource,
        selectedPages: step1.selectedPages,
        savedScreenshots: step2.savedScreenshots,
        showToast: adaptedShowToast,
    });
    const qOps = useQuestionOps({
        taskId: step1.taskId,
        generatedQuestions: step3.generatedQuestions,
        rawExtractText: step2.rawExtractText,
        showToast: adaptedShowToast,
    });

    // ── Derived ────────────────────────────────────────────────────────────────
    const canEnterStep2 = step1.canEnterStep2;
    const hasExtractedResult = step2.hasExtractedResult;
    const canEnterStep3 = step1.generationMode === 'pdf_direct'
        ? Boolean(step1.file)
        : hasExtractedResult;

    // ── Effects ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('sub2_current_step', String(currentStep));
        }
    }, [currentStep]);

    useEffect(() => {
        if (currentStep === 3 && !canEnterStep3) {
            setCurrentStep(canEnterStep2 ? 2 : 1);
        } else if (currentStep === 2 && !canEnterStep2) {
            setCurrentStep(1);
        }
    }, [currentStep, canEnterStep2, canEnterStep3]);

    useEffect(() => {
        if ((step2.exercises.length > 0 || step3.generatedQuestions) && (window as any).MathJax) {
            (window as any).MathJax.typesetPromise().catch((err: any) => {
                log.warn('sub2', 'MathJax typeset failed', { message: err?.message });
            });
        }
    }, [step2.exercises, step3.generatedQuestions]);

    // ── replayFromHistory (cross-cutting: touches step1 + step3 state) ─────────
    const replayFromHistory = async (historyItem: any) => {
        if (!historyItem?.id) {
            showToast('Replay failed: invalid history item.', 'error');
            return;
        }

        const params = historyItem.params || {};
        if (params.question_type) step3.setQuestionType(params.question_type);
        if (params.num_questions) step3.setNumQuestions(params.num_questions);
        if (params.difficulty) step3.setDifficulty(params.difficulty);
        if (Array.isArray(params.constraints)) step3.setConstraints(params.constraints.join('\n'));
        if (params.output_language) step3.setOutputLanguage(params.output_language);
        if (params.source_type) step1.setGenerationSource(params.source_type);

        try {
            step1.setUploadLoading(true);
            const data = await sub2Api.replayGenerationHistory(historyItem.id);
            if (!data?.success || !data?.task_id) {
                showToast(data?.error || 'Replay failed: could not restore source file.', 'error');
                return;
            }

            step1.setFile({ name: data.filename || 'history-source.pdf' } as File);
            step1.setFileName(data.filename || 'history-source.pdf');
            step1.setFileType(data.file_type || 'pdf');
            step1.setTaskId(data.task_id);
            step1.setTotalPages(Number(data.total_pages || 0));
            step1.setSelectedPages(Array.isArray(data.page_numbers) ? data.page_numbers : []);

            const replaySourceType = data.source_type || params.source_type || 'pdf';
            step1.setGenerationSource(replaySourceType);
            if (replaySourceType === 'pdf') {
                step1.selectGenerationMode('pdf_direct');
            }

            setCurrentStep(1);
            showToast('Replay ready: source PDF restored to Upload step.', 'success');
        } catch (err: any) {
            showToast('Replay failed: ' + (err?.message || 'unknown error'), 'error');
        } finally {
            step1.setUploadLoading(false);
        }
    };

    // ── Compose states & handlers (shape kept identical for downstream components) ──
    const states = {
        currentStep,
        file: step1.file, fileName: step1.fileName, fileType: step1.fileType,
        totalPages: step1.totalPages, selectedPages: step1.selectedPages,
        uploadLoading: step1.uploadLoading, isDragging: step1.isDragging,
        generationMode: step1.generationMode, generationSource: step1.generationSource,
        extractPrompt: step2.extractPrompt, extractLoading: step2.extractLoading,
        exercises: step2.exercises, rawExtractText: step2.rawExtractText,
        selectedExercises: step2.selectedExercises, savedScreenshots: step2.savedScreenshots,
        hasExtractedResult,
        questionType: step3.questionType, numQuestions: step3.numQuestions,
        difficulty: step3.difficulty, constraints: step3.constraints,
        constraintSuggestions: step3.constraintSuggestions,
        isSuggestingConstraints: step3.isSuggestingConstraints,
        outputLanguage: step3.outputLanguage, generateLoading: step3.generateLoading,
        generatedQuestions: step3.generatedQuestions, provider: step3.provider,
        questionOpsRunId: qOps.questionOpsRunId,
        questionOpsSummary: qOps.questionOpsSummary,
        questionOpsItems: qOps.questionOpsItems,
        questionOpsLoading: qOps.questionOpsLoading,
        questionOpsError: qOps.questionOpsError,
        questionOpsThreshold: qOps.questionOpsThreshold,
        questionOpsSort: qOps.questionOpsSort,
        questionOpsDuplicatesOnly: qOps.questionOpsDuplicatesOnly,
        questionOpsTagFilter: qOps.questionOpsTagFilter,
        questionOpsDedupeResult: qOps.questionOpsDedupeResult,
        questionOpsDedupeLoading: qOps.questionOpsDedupeLoading,
    };

    const handlers = {
        // Step 1
        setGenerationMode: step1.selectGenerationMode,
        setGenerationSource: step1.setGenerationSource,
        handleFileChange: (e: any) => { setCurrentStep(1); step1.handleFile(e.target.files?.[0] ?? null); },
        handleDragOver: step1.handleDragOver,
        handleDragLeave: step1.handleDragLeave,
        handleDrop: (e: any) => { e.preventDefault(); step1.handleDrop(e); setCurrentStep(1); },
        togglePage: step1.togglePage,
        selectAllPages: step1.selectAllPages,
        clearPageSelection: step1.clearPageSelection,
        // Step 2
        setExtractPrompt: step2.setExtractPrompt,
        extractContent: step2.extractContent,
        toggleExercise: step2.toggleExercise,
        toggleAllExercises: step2.toggleAllExercises,
        clearExerciseSelection: step2.clearExerciseSelection,
        updateExerciseText: step2.updateExerciseText,
        deleteExercise: step2.deleteExercise,
        takeSingleScreenshot: step2.takeSingleScreenshot,
        takeBatchScreenshots: step2.takeBatchScreenshots,
        removeScreenshot: step2.removeScreenshot,
        // Step 3
        setQuestionType: step3.setQuestionType,
        setNumQuestions: step3.setNumQuestions,
        setDifficulty: step3.setDifficulty,
        setConstraints: step3.setConstraints,
        setOutputLanguage: step3.setOutputLanguage,
        setProvider: step3.setProvider,
        onSuggestConstraints: step3.onSuggestConstraints,
        generateQuestions: step3.generateQuestions,
        exportQuestions: step3.exportQuestions,
        // QuestionOps
        setQuestionOpsThreshold: qOps.setQuestionOpsThreshold,
        setQuestionOpsSort: qOps.setQuestionOpsSort,
        setQuestionOpsDuplicatesOnly: qOps.setQuestionOpsDuplicatesOnly,
        setQuestionOpsTagFilter: qOps.setQuestionOpsTagFilter,
        runQuestionOps: qOps.runQuestionOps,
        applyQuestionOpsDedupe: qOps.applyQuestionOpsDedupe,
        // Navigation
        goToStep1: () => setCurrentStep(1),
        goToStep2: () => { if (canEnterStep2) setCurrentStep(2); },
        goToStep3: () => {
            if (!canEnterStep3) return;
            if (step1.generationMode === 'pdf_direct') step1.setGenerationSource('pdf');
            setCurrentStep(3);
        },
        replayFromHistory,
    };

    return { states, handlers, toasts, removeToast };
}
