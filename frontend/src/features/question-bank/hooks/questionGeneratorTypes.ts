import type { Dispatch, SetStateAction } from 'react';

import type { QuestionDraft, Toast } from '@/types/api';

import type { QuestionProviderStatus } from '../api/questionBankApi';
import type { QuestionStudioHistoryItem } from '../components/QuestionStudioCards';
import type { QuestionStudioProvider } from '../questionProviderConfig';

export type StudioView = 'hub' | 'generate';
export type WorkspaceStep = 'start' | 'composer' | 'result';
export type QuestionExportFormat = 'markdown' | 'pdf';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type HistoryState = {
    items: QuestionStudioHistoryItem[];
    loading: boolean;
};

export interface QuestionGeneratorController {
    state: {
        view: StudioView;
        workspaceStep: WorkspaceStep;
        historyState: HistoryState;
        provider: QuestionStudioProvider | null;
        providerLoading: boolean;
        providerError: string;
        sourceText: string;
        questionType: string;
        numQuestions: number;
        difficulty: number;
        outputLanguage: string;
        constraints: string;
        uploading: boolean;
        dragActive: boolean;
        selectedFile: File | null;
        taskId: string | null;
        totalPages: number;
        useAllPages: boolean;
        pageSelectionInput: string;
        historyId: string | null;
        streamMessage: string;
        isGenerating: boolean;
        isSavingHistory: boolean;
        resultMarkdown: string;
        questions: QuestionDraft[];
        selectedQuestionIds: string[];
    };
    derived: {
        selectedQuestions: QuestionDraft[];
        selectedProviderStatus: QuestionProviderStatus | null;
        preferredProviderOptions: QuestionProviderStatus[];
        preferredAiConfigOptions: QuestionProviderStatus[];
        currentResultLabel: string;
        currentResultModel: string;
        currentResultSource: string;
        hasGenerationInput: boolean;
        aiSelectorLabel: string;
        streamPhaseLabel: string;
        pageScopeSummary: string;
        currentStepIndex: number;
    };
    actions: {
        setView: StateSetter<StudioView>;
        setWorkspaceStep: StateSetter<WorkspaceStep>;
        setSourceText: StateSetter<string>;
        setQuestionType: StateSetter<string>;
        setNumQuestions: StateSetter<number>;
        setDifficulty: StateSetter<number>;
        setOutputLanguage: StateSetter<string>;
        setConstraints: StateSetter<string>;
        setDragActive: StateSetter<boolean>;
        setProvider: StateSetter<QuestionStudioProvider | null>;
        setResultMarkdown: StateSetter<string>;
        setUseAllPages: StateSetter<boolean>;
        setPageSelectionInput: StateSetter<string>;
        navigateToAiConfig: () => void;
        handleUploadedFile: (file: File) => Promise<void>;
        hydrateHistoryResult: (historyId: string) => Promise<void>;
        handleGenerate: () => Promise<void>;
        handleSaveHistory: () => Promise<void>;
        handleExport: (format: QuestionExportFormat) => Promise<void>;
        updateQuestion: (questionId: string, field: keyof QuestionDraft, value: string, optionIndex?: number) => void;
        addOption: (questionId: string) => void;
        removeOption: (questionId: string, optionIndex: number) => void;
        toggleSelectedQuestion: (questionId: string) => void;
    };
    toasts: Toast[];
    removeToast: (id: number) => void;
}
