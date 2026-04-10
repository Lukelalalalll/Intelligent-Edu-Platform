import type { AIProvider } from '../../../../shared/aiProvider';

export type GenerationSource = 'pdf' | 'screenshot_set';
export type GenerationMode = 'pdf_direct' | 'extract_first';
export type QuestionOpsSort = 'quality_desc' | 'quality_asc';

export type SavedScreenshot = {
    filename: string;
    dataUrl: string;
};

export type QuestionOpsItem = {
    item_id: string;
    quality_score?: number;
    is_duplicate?: boolean;
    difficulty_estimate?: string;
    status?: string;
    question?: string;
    coverage_tags?: string[];
};

export type QuestionOpsDedupeResult = {
    kept: number;
    removed: number;
};

export type QuestionOpsSummary = {
    question_count?: number;
    avg_quality_score?: number;
    duplicate_count?: number;
    [key: string]: unknown;
};

export type GenerationSourceSelectorProps = {
    generationSource: GenerationSource;
    generationMode: GenerationMode;
    fileName: string;
    selectedPages: number[];
    savedScreenshots: SavedScreenshot[];
    setGenerationSource: (source: GenerationSource) => void;
};

export type GenerationConfigFormProps = {
    questionType: string;
    numQuestions: number;
    difficulty: number;
    constraints: string;
    outputLanguage: string;
    provider: AIProvider;
    constraintSuggestions: string[];
    isSuggestingConstraints: boolean;
    setQuestionType: (value: string) => void;
    setNumQuestions: (value: number) => void;
    setDifficulty: (value: number) => void;
    setConstraints: (value: string) => void;
    setOutputLanguage: (value: string) => void;
    setProvider: (value: AIProvider) => void;
    onSuggestConstraints: () => void;
};

export type GeneratedQuestionsPanelProps = {
    generatedQuestions: string | null;
    generateLoading: boolean;
    exportQuestions: () => void;
};

export type QuestionOpsPanelProps = {
    generatedQuestions: string | null;
    rawExtractText: string;
    questionOpsSummary: QuestionOpsSummary | null;
    questionOpsItems: QuestionOpsItem[];
    questionOpsLoading: boolean;
    questionOpsError: string;
    questionOpsThreshold: string;
    questionOpsSort: QuestionOpsSort;
    questionOpsDuplicatesOnly: boolean;
    questionOpsTagFilter: string;
    questionOpsDedupeResult: QuestionOpsDedupeResult | null;
    questionOpsDedupeLoading: boolean;
    setQuestionOpsThreshold: (value: string) => void;
    setQuestionOpsSort: (value: QuestionOpsSort) => void;
    setQuestionOpsDuplicatesOnly: (checked: boolean) => void;
    setQuestionOpsTagFilter: (tag: string) => void;
    runQuestionOps: () => void;
    applyQuestionOpsDedupe: () => void;
};

export type Step3GenerateStates = {
    exercises: Array<Record<string, unknown>>;
    rawExtractText: string;
    questionType: string;
    numQuestions: number;
    difficulty: number;
    constraints: string;
    savedScreenshots: SavedScreenshot[];
    outputLanguage: string;
    generateLoading: boolean;
    generatedQuestions: string | null;
    provider: AIProvider;
    constraintSuggestions: string[];
    isSuggestingConstraints: boolean;
    generationSource: GenerationSource;
    generationMode: GenerationMode;
    fileName: string;
    selectedPages: number[];
    questionOpsSummary: QuestionOpsSummary | null;
    questionOpsItems: QuestionOpsItem[];
    questionOpsLoading: boolean;
    questionOpsError: string;
    questionOpsThreshold: string;
    questionOpsSort: QuestionOpsSort;
    questionOpsDuplicatesOnly: boolean;
    questionOpsTagFilter: string;
    questionOpsDedupeResult: QuestionOpsDedupeResult | null;
    questionOpsDedupeLoading: boolean;
};

export type Step3GenerateHandlers = {
    setQuestionType: (value: string) => void;
    setNumQuestions: (value: number) => void;
    setDifficulty: (value: number) => void;
    setConstraints: (value: string) => void;
    setOutputLanguage: (value: string) => void;
    setGenerationSource: (value: GenerationSource) => void;
    setProvider: (value: AIProvider) => void;
    onSuggestConstraints: () => void;
    setQuestionOpsThreshold: (value: string) => void;
    setQuestionOpsSort: (value: QuestionOpsSort) => void;
    setQuestionOpsDuplicatesOnly: (value: boolean) => void;
    setQuestionOpsTagFilter: (value: string) => void;
    goToStep2: () => void;
    generateQuestions: () => void;
    exportQuestions: () => void;
    runQuestionOps: () => void;
    applyQuestionOpsDedupe: () => void;
};

export type Step3GenerateProps = {
    states: Step3GenerateStates;
    handlers: Step3GenerateHandlers;
};
