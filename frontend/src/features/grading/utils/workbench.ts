import { resolveApiRoot } from '@/shared/api/client';
import type {
    WorkbenchGrade,
    WorkbenchRubric,
    WorkbenchSubmissionDetail,
} from '../types/workbench';

const apiRoot = resolveApiRoot();

type AnalysisItem = Record<string, unknown>;
type ParsedAnalysis = AnalysisItem & {
    overall_feedback?: unknown;
    overall_score?: unknown;
    improvement_suggestions?: unknown;
    question_grades?: unknown;
    rubric_scores?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getParsedAnalysis(source: unknown): ParsedAnalysis | null {
    if (!isRecord(source)) {
        return null;
    }

    if (isRecord(source.parsed)) {
        return source.parsed as ParsedAnalysis;
    }

    return source as ParsedAnalysis;
}

export function normalizePdfUrl(rawUrl: string): string {
    try {
        const urlObj = new URL(rawUrl, `${apiRoot}/`);
        let pathname = urlObj.pathname;

        for (let i = 0; i < 2; i += 1) {
            const decoded = decodeURIComponent(pathname);
            if (decoded === pathname) {
                break;
            }
            pathname = decoded;
        }

        urlObj.pathname = pathname
            .split('/')
            .map((segment) => (segment ? encodeURIComponent(segment) : ''))
            .join('/');

        return urlObj.toString();
    } catch {
        return rawUrl;
    }
}

export function buildPdfUrl(pdfPath?: string, pdfVersion?: number): string {
    if (!pdfPath) {
        return '';
    }

    const rawPath = pdfPath.startsWith('http')
        ? pdfPath
        : `${apiRoot}/${pdfPath}`;
    const normalized = normalizePdfUrl(rawPath);

    if (typeof pdfVersion !== 'number') {
        return normalized;
    }

    return `${normalized}${normalized.includes('?') ? '&' : '?'}v=${pdfVersion}`;
}

export function extractGradeFromAnalysis(analysis: unknown): WorkbenchGrade | null {
    const parsed = getParsedAnalysis(analysis);
    if (!parsed) {
        return null;
    }

    const nextRubricScores: Record<string, number> = {};
    let nextTotal: number | undefined;
    let nextFeedback = String(parsed.overall_feedback || '').trim();

    const questionGrades = Array.isArray(parsed.question_grades) ? parsed.question_grades : [];
    if (questionGrades.length) {
        let scored = 0;
        let maxScored = 0;

        questionGrades.forEach((item, idx) => {
            const entry = isRecord(item) ? item : {};
            const questionId = String(entry.question_id || `Q${idx + 1}`).trim();
            const score = Number(entry.score);
            const maxScore = Number(entry.max_score);

            if (Number.isFinite(score)) {
                nextRubricScores[questionId] = score;
                scored += score;
            }
            if (Number.isFinite(maxScore) && maxScore > 0) {
                maxScored += maxScore;
            }
        });

        if (typeof parsed.overall_score === 'number' && Number.isFinite(parsed.overall_score)) {
            nextTotal = parsed.overall_score;
        } else if (maxScored > 0) {
            nextTotal = Number(((scored / maxScored) * 100).toFixed(2));
        } else {
            nextTotal = Number(scored.toFixed(2));
        }
    } else {
        const rubricScores = Array.isArray(parsed.rubric_scores) ? parsed.rubric_scores : [];

        rubricScores.forEach((item, idx) => {
            const entry = isRecord(item) ? item : {};
            const criterion = String(entry.criterion || `criterion_${idx + 1}`).trim();
            const score = Number(entry.score);

            if (criterion && Number.isFinite(score)) {
                nextRubricScores[criterion] = score;
            }
        });

        if (typeof parsed.overall_score === 'number' && Number.isFinite(parsed.overall_score)) {
            nextTotal = parsed.overall_score;
        }
    }

    if (!nextFeedback) {
        const suggestions = Array.isArray(parsed.improvement_suggestions) ? parsed.improvement_suggestions : [];
        if (suggestions.length > 0) {
            nextFeedback = suggestions.map((item) => `- ${String(item)}`).join('\n');
        }
    }

    if (nextTotal === undefined && Object.keys(nextRubricScores).length === 0 && !nextFeedback) {
        return null;
    }

    return {
        totalScore: nextTotal,
        rubricScores: nextRubricScores,
        overallFeedback: nextFeedback,
    };
}

export function selectCurrentRubric(detail: WorkbenchSubmissionDetail | null | undefined): WorkbenchRubric {
    const rubric = detail?.assignment?.rubric;
    if (!rubric || typeof rubric !== 'object') {
        return {};
    }
    return rubric;
}

export function selectCurrentScores(
    aiSuggestedGrade: WorkbenchGrade | null,
    detail: WorkbenchSubmissionDetail | null | undefined,
): WorkbenchGrade | null {
    return aiSuggestedGrade || detail?.grade || detail?.annotationsStore || null;
}
