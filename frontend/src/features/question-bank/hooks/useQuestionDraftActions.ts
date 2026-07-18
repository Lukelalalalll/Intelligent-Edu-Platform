import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { QuestionDraft } from '@/types/api';

import { normalizeQuestionDraft } from '../questionDraftUtils';

export function useQuestionDraftActions(
    setQuestions: Dispatch<SetStateAction<QuestionDraft[]>>,
    setSelectedQuestionIds: Dispatch<SetStateAction<string[]>>,
) {
    const updateQuestion = useCallback((
        questionId: string,
        field: keyof QuestionDraft,
        value: string,
        optionIndex?: number,
    ) => {
        setQuestions((current) => current.map((question, index) => {
            if (question.id !== questionId) return question;
            const next = { ...question };
            if (field === 'options') {
                const nextOptions = [...question.options];
                if (typeof optionIndex === 'number') {
                    nextOptions[optionIndex] = value;
                }
                next.options = nextOptions;
            } else {
                (next[field] as string) = value;
            }
            return normalizeQuestionDraft(next, index);
        }));
    }, [setQuestions]);

    const addOption = useCallback((questionId: string) => {
        setQuestions((current) => current.map((question, index) => (
            question.id === questionId
                ? normalizeQuestionDraft({
                    ...question,
                    options: [...question.options, `${String.fromCharCode(65 + question.options.length)}. `],
                }, index)
                : question
        )));
    }, [setQuestions]);

    const removeOption = useCallback((questionId: string, optionIndex: number) => {
        setQuestions((current) => current.map((question, index) => (
            question.id === questionId
                ? normalizeQuestionDraft({
                    ...question,
                    options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex),
                }, index)
                : question
        )));
    }, [setQuestions]);

    const toggleSelectedQuestion = useCallback((questionId: string) => {
        setSelectedQuestionIds((current) => (
            current.includes(questionId)
                ? current.filter((item) => item !== questionId)
                : [...current, questionId]
        ));
    }, [setSelectedQuestionIds]);

    return {
        updateQuestion,
        addOption,
        removeOption,
        toggleSelectedQuestion,
    };
}
