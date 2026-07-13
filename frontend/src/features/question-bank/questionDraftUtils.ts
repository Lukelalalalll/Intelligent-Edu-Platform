import type { QuestionDraft } from '@/types/api';

export function normalizeQuestionDraft(question: QuestionDraft, index: number): QuestionDraft {
    const options = Array.isArray(question.options)
        ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
        : [];
    const normalized: QuestionDraft = {
        id: String(question.id || `q_${index + 1}`),
        stem: String(question.stem || '').trim(),
        options,
        answer: String(question.answer || '').trim(),
        explanation: String(question.explanation || '').trim(),
        raw_markdown: String(question.raw_markdown || '').trim(),
    };
    if (!normalized.raw_markdown) {
        normalized.raw_markdown = buildQuestionMarkdown(normalized, index);
    }
    return normalized;
}

export function buildQuestionMarkdown(question: QuestionDraft, index: number): string {
    const parts = [`${index + 1}. Question: ${String(question.stem || '').trim()}`];
    parts.push(...(question.options || []).map((option) => String(option || '').trim()).filter(Boolean));
    if (String(question.answer || '').trim()) {
        parts.push(`Answer: ${String(question.answer || '').trim()}`);
    }
    if (String(question.explanation || '').trim()) {
        parts.push(`Explanation: ${String(question.explanation || '').trim()}`);
    }
    return parts.join('\n').trim();
}

export function buildQuestionsMarkdown(questions: QuestionDraft[]): string {
    return questions.map((question, index) => buildQuestionMarkdown(question, index)).join('\n\n').trim();
}
