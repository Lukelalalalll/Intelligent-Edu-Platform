// features/question-bank/types.ts
// Shared domain types for the question-bank feature.

export type GenerationSource = 'pdf' | 'screenshot_set';
export type GenerationMode = 'pdf_direct' | 'extract_first';
export type QuestionOpsSort = 'quality_desc' | 'quality_asc';

export type SavedScreenshot = {
    filename: string;
    dataUrl: string;
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

export type QuestionOpsItem = {
    item_id: string;
    quality_score?: number;
    is_duplicate?: boolean;
    difficulty_estimate?: string;
    status?: string;
    question?: string;
    coverage_tags?: string[];
};
