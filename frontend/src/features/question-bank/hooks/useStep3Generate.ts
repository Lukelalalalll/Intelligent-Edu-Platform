import { useState, useEffect } from 'react';
import * as sub2Api from '../api/questionBankApi';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '@/shared/aiProvider';
import type { GenerationSource, SavedScreenshot } from '../types';

interface UseStep3GenerateOptions {
    taskId: string | null;
    generationSource: GenerationSource;
    selectedPages: number[];
    savedScreenshots: SavedScreenshot[];
    showToast: (msg: string, type: string) => void;
}

export function useStep3Generate({
    taskId,
    generationSource,
    selectedPages,
    savedScreenshots,
    showToast,
}: UseStep3GenerateOptions) {
    const [questionType, setQuestionType] = useState('Multiple choice');
    const [numQuestions, setNumQuestions] = useState(5);
    const [difficulty, setDifficulty] = useState(3);
    const [constraints, setConstraints] = useState('');
    const [constraintSuggestions, setConstraintSuggestions] = useState<string[]>([]);
    const [isSuggestingConstraints, setIsSuggestingConstraints] = useState(false);
    const [outputLanguage, setOutputLanguage] = useState('English');
    const [generateLoading, setGenerateLoading] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<string | null>(null);
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    useEffect(() => {
        if (questionType === 'Quiz') setNumQuestions(10);
        else if (questionType === 'Exam Paper') setNumQuestions(15);
    }, [questionType]);

    const generateQuestions = async () => {
        if (generationSource === 'screenshot_set' && savedScreenshots.length === 0) {
            showToast('Visual reference set is empty. Curate screenshots first or switch source to PDF Content.', 'warning');
            return;
        }

        const parsedCount = parseInt(String(numQuestions), 10);
        const safeNumQuestions = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 5;
        const parsedDifficulty = parseInt(String(difficulty), 10);
        const safeDifficulty = Number.isFinite(parsedDifficulty) && parsedDifficulty > 0 ? parsedDifficulty : 3;
        const safeConstraints = String(constraints || '')
            .split('\n').map(c => c.trim()).filter(Boolean);

        const payload = {
            provider,
            task_id: taskId,
            question_type: String(questionType || 'Multiple choice').trim() || 'Multiple choice',
            num_questions: safeNumQuestions,
            difficulty: safeDifficulty,
            constraints: safeConstraints,
            output_language: String(outputLanguage || 'English').trim() || 'English',
            source_type: generationSource,
            page_numbers: selectedPages,
            saved_screenshots: Array.isArray(savedScreenshots)
                ? savedScreenshots.map(s => s.filename).filter(Boolean)
                : [],
        };

        setGenerateLoading(true);
        setGeneratedQuestions(null);
        try {
            const data = await sub2Api.generateQuestions(payload);
            if (data.success) {
                setGeneratedQuestions(data.questions);
            } else {
                showToast(data.error, 'error');
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            let detailText = '';
            if (Array.isArray(detail)) {
                detailText = detail.map((d: any) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
            } else if (typeof detail === 'string') {
                detailText = detail;
            } else if (err?.response?.data?.error) {
                detailText = String(err.response.data.error);
            }
            showToast('Generation error: ' + (detailText || err.message), 'error');
        } finally {
            setGenerateLoading(false);
        }
    };

    const suggestConstraintHints = async () => {
        if (!taskId) {
            showToast('Please complete Step 1 upload first.', 'warning');
            return;
        }
        setIsSuggestingConstraints(true);
        try {
            const payload = {
                provider,
                task_id: taskId,
                source_type: generationSource,
                page_numbers: selectedPages,
                question_type: String(questionType || 'Multiple choice').trim() || 'Multiple choice',
                num_questions: Number.parseInt(String(numQuestions), 10) || 5,
                difficulty: Number.parseInt(String(difficulty), 10) || 3,
                output_language: String(outputLanguage || 'English').trim() || 'English',
            };
            const data = await sub2Api.suggestConstraints(payload);
            if (data.success) {
                setConstraintSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
            } else {
                showToast(data.error || 'Failed to generate suggestions', 'error');
            }
        } catch (err: any) {
            showToast('Suggestion failed: ' + (err?.message || 'unknown error'), 'error');
        } finally {
            setIsSuggestingConstraints(false);
        }
    };

    const exportQuestions = async () => {
        try {
            const blob = await sub2Api.exportQuestions(taskId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'questions.md';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch {
            showToast('Export failed', 'error');
        }
    };

    return {
        questionType, setQuestionType,
        numQuestions, setNumQuestions,
        difficulty, setDifficulty,
        constraints, setConstraints,
        constraintSuggestions,
        isSuggestingConstraints,
        outputLanguage, setOutputLanguage,
        generateLoading,
        generatedQuestions,
        provider, setProvider,
        generateQuestions,
        exportQuestions,
        onSuggestConstraints: suggestConstraintHints,
    };
}
