import type { QuestionDraft } from '@/types/api';

const QUESTION_START_RE = /^\s*(\d+)[\.\)]\s*(?:\*\*)?(?:Question\s*[:：]\s*)?(.*?)(?:\*\*)?\s*$/i;
const QUESTION_START_GLOBAL_RE = /^\s*(\d+)[\.\)]\s*(?:\*\*)?(?:Question\s*[:：]\s*)?(.*?)(?:\*\*)?\s*$/gim;
const OPTION_RE = /^\s*(?:[-*]\s+)?(?:\(?([A-H])\)?[\.\):])\s+(.*)$/;
const ANSWER_RE = /^\s*Answer\s*[:：]\s*(.*)$/i;
const EXPLANATION_RE = /^\s*Explanation\s*[:：]\s*(.*)$/i;

function cleanLine(value: string): string {
    return String(value || '').replace(/\s+$/, '').trim();
}

function splitQuestionBlocks(markdown: string): string[] {
    const text = String(markdown || '').trim();
    if (!text) return [];

    const matches = [...text.matchAll(QUESTION_START_GLOBAL_RE)];
    if (!matches.length) {
        return [text];
    }

    return matches
        .map((match, index) => {
            const start = match.index ?? 0;
            const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
            return text.slice(start, end).trim();
        })
        .filter(Boolean);
}

function parseQuestionBlock(block: string, index: number): QuestionDraft {
    const lines = String(block || '').split('\n');
    const stemParts: string[] = [];
    const options: string[] = [];
    const answerParts: string[] = [];
    const explanationParts: string[] = [];
    let activeSection: 'stem' | 'options' | 'answer' | 'explanation' = 'stem';

    lines.forEach((rawLine, lineIndex) => {
        const line = rawLine.trim();
        if (!line) {
            if (activeSection === 'stem' && stemParts.length > 0) {
                stemParts.push('');
            } else if (activeSection === 'answer' && answerParts.length > 0) {
                answerParts.push('');
            } else if (activeSection === 'explanation' && explanationParts.length > 0) {
                explanationParts.push('');
            }
            return;
        }

        if (lineIndex === 0) {
            const match = line.match(QUESTION_START_RE);
            if (match) {
                const stemText = cleanLine(match[2]);
                if (stemText) stemParts.push(stemText);
                activeSection = 'stem';
                return;
            }
        }

        const optionMatch = line.match(OPTION_RE);
        if (optionMatch) {
            const label = optionMatch[1].toUpperCase();
            const body = cleanLine(optionMatch[2]);
            options.push(body ? `${label}. ${body}` : `${label}.`);
            activeSection = 'options';
            return;
        }

        const answerMatch = line.match(ANSWER_RE);
        if (answerMatch) {
            activeSection = 'answer';
            const answerText = cleanLine(answerMatch[1]);
            if (answerText) answerParts.push(answerText);
            return;
        }

        const explanationMatch = line.match(EXPLANATION_RE);
        if (explanationMatch) {
            activeSection = 'explanation';
            const explanationText = cleanLine(explanationMatch[1]);
            if (explanationText) explanationParts.push(explanationText);
            return;
        }

        if (activeSection === 'options' && options.length > 0) {
            options[options.length - 1] = cleanLine(`${options[options.length - 1]} ${line}`);
        } else if (activeSection === 'answer') {
            answerParts.push(line);
        } else if (activeSection === 'explanation') {
            explanationParts.push(line);
        } else {
            stemParts.push(line);
        }
    });

    const stem = stemParts.join('\n').trim();
    const answer = answerParts.join('\n').trim();
    const explanation = explanationParts.join('\n').trim();
    const raw_markdown = String(block || '').trim();

    return normalizeQuestionDraft({
        id: `q_${index + 1}`,
        stem: stem || `Question ${index + 1}`,
        options,
        answer,
        explanation,
        raw_markdown,
    }, index);
}

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
    const rawMarkdown = String(question.raw_markdown || '').trim();
    if (rawMarkdown) {
        return rawMarkdown;
    }

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

export function parseQuestionMarkdown(markdown: string): QuestionDraft[] {
    return splitQuestionBlocks(markdown)
        .map((block, index) => parseQuestionBlock(block, index))
        .filter((question) => Boolean(String(question.raw_markdown || '').trim()));
}
