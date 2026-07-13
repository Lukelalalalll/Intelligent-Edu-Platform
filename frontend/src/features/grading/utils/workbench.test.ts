import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/client', () => ({
    resolveApiRoot: () => 'http://api.test',
}));

import {
    buildPdfUrl,
    extractGradeFromAnalysis,
    selectCurrentRubric,
    selectCurrentScores,
} from './workbench';

describe('grading workbench helpers', () => {
    it('builds a normalized PDF URL with version cache busting', () => {
        expect(buildPdfUrl('uploads/essay 1.pdf', 7)).toBe(
            'http://api.test/uploads/essay%201.pdf?v=7',
        );
        expect(buildPdfUrl('https://cdn.example.com/files/essay%25201.pdf?token=abc', 9)).toBe(
            'https://cdn.example.com/files/essay%201.pdf?token=abc&v=9',
        );
    });

    it('extracts grade data from question-based analysis', () => {
        expect(extractGradeFromAnalysis({
            parsed: {
                overall_feedback: 'Solid work.',
                question_grades: [
                    { question_id: 'Q1', score: 4, max_score: 5 },
                    { question_id: 'Q2', score: 8, max_score: 10 },
                ],
            },
        })).toEqual({
            totalScore: 80,
            rubricScores: {
                Q1: 4,
                Q2: 8,
            },
            overallFeedback: 'Solid work.',
        });
    });

    it('extracts grade data from rubric-based analysis', () => {
        expect(extractGradeFromAnalysis({
            parsed: {
                overall_score: 92,
                rubric_scores: [
                    { criterion: 'clarity', score: 9 },
                    { criterion: 'evidence', score: 8 },
                ],
            },
        })).toEqual({
            totalScore: 92,
            rubricScores: {
                clarity: 9,
                evidence: 8,
            },
            overallFeedback: '',
        });
    });

    it('falls back to improvement suggestions when no score payload exists', () => {
        expect(extractGradeFromAnalysis({
            parsed: {
                improvement_suggestions: ['Add more detail', 'Cite sources'],
            },
        })).toEqual({
            totalScore: undefined,
            rubricScores: {},
            overallFeedback: '- Add more detail\n- Cite sources',
        });
    });

    it('returns null for invalid analysis payloads', () => {
        expect(extractGradeFromAnalysis(null)).toBeNull();
        expect(extractGradeFromAnalysis({ parsed: 'bad-payload' })).toBeNull();
    });

    it('keeps rubric and score selection priorities stable', () => {
        const detail = {
            assignment: { rubric: { clarity: 10 } },
            grade: { totalScore: 72, rubricScores: { clarity: 7 }, overallFeedback: 'Teacher score' },
            annotationsStore: { totalScore: 61, rubricScores: { clarity: 6 }, overallFeedback: 'Stored score' },
        };

        expect(selectCurrentRubric(detail as any)).toEqual({ clarity: 10 });
        expect(selectCurrentScores(
            { totalScore: 88, rubricScores: { clarity: 8 }, overallFeedback: 'AI score' },
            detail as any,
        )).toEqual({
            totalScore: 88,
            rubricScores: { clarity: 8 },
            overallFeedback: 'AI score',
        });
        expect(selectCurrentScores(null, detail as any)).toEqual({
            totalScore: 72,
            rubricScores: { clarity: 7 },
            overallFeedback: 'Teacher score',
        });
        expect(selectCurrentScores(null, {
            ...detail,
            grade: null,
        } as any)).toEqual({
            totalScore: 61,
            rubricScores: { clarity: 6 },
            overallFeedback: 'Stored score',
        });
    });
});
