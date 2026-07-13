import { useState } from 'react';
import { questionOpsApi } from '../api/questionOpsApi';
import type { QuestionOpsSort, QuestionOpsDedupeResult, QuestionOpsSummary, QuestionOpsItem } from '../types';

interface UseQuestionOpsOptions {
    taskId: string | null;
    generatedQuestions: string | null;
    rawExtractText: string;
    showToast: (msg: string, type?: string) => void;
}

export function useQuestionOps({ taskId, generatedQuestions, rawExtractText, showToast }: UseQuestionOpsOptions) {
    const [questionOpsRunId, setQuestionOpsRunId] = useState('');
    const [questionOpsSummary, setQuestionOpsSummary] = useState<QuestionOpsSummary | null>(null);
    const [questionOpsItems, setQuestionOpsItems] = useState<QuestionOpsItem[]>([]);
    const [questionOpsLoading, setQuestionOpsLoading] = useState(false);
    const [questionOpsError, setQuestionOpsError] = useState('');
    const [questionOpsThreshold, setQuestionOpsThreshold] = useState('0.82');
    const [questionOpsSort, setQuestionOpsSort] = useState<QuestionOpsSort>('quality_desc');
    const [questionOpsDuplicatesOnly, setQuestionOpsDuplicatesOnly] = useState(false);
    const [questionOpsTagFilter, setQuestionOpsTagFilter] = useState('all');
    const [questionOpsDedupeResult, setQuestionOpsDedupeResult] = useState<QuestionOpsDedupeResult | null>(null);
    const [questionOpsDedupeLoading, setQuestionOpsDedupeLoading] = useState(false);

    const runQuestionOps = async () => {
        if (questionOpsLoading) return;

        const sourceText = typeof generatedQuestions === 'string' ? generatedQuestions : rawExtractText;
        const thresholdNum = Number.parseFloat(questionOpsThreshold);
        const safeThreshold = Number.isFinite(thresholdNum) ? thresholdNum : 0.82;

        setQuestionOpsLoading(true);
        setQuestionOpsError('');
        setQuestionOpsDedupeResult(null);
        try {
            const run = await questionOpsApi.createRun({
                task_id: taskId,
                source_text: sourceText || undefined,
                dedupe_threshold: safeThreshold,
            });
            const runId = run.run_id;
            setQuestionOpsRunId(runId);
            setQuestionOpsSummary((run.summary || null) as any);

            const itemRes = await questionOpsApi.getItems(runId);
            setQuestionOpsItems((itemRes.items || []) as any);
            showToast('QuestionOps analysis completed.', 'success');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : 'Failed to run QuestionOps analysis';
            setQuestionOpsError(msg);
            showToast(msg, 'error');
        } finally {
            setQuestionOpsLoading(false);
        }
    };

    const applyQuestionOpsDedupe = async () => {
        if (!questionOpsRunId || questionOpsDedupeLoading) return;

        const thresholdNum = Number.parseFloat(questionOpsThreshold);
        if (!Number.isFinite(thresholdNum) || thresholdNum < 0 || thresholdNum > 1) {
            const msg = 'Threshold must be between 0.00 and 1.00.';
            setQuestionOpsError(msg);
            showToast(msg, 'warning');
            return;
        }

        setQuestionOpsDedupeLoading(true);
        setQuestionOpsError('');
        try {
            const dedupeRes = await questionOpsApi.applyDedupe(questionOpsRunId, {
                dedupe_threshold: thresholdNum,
            });
            setQuestionOpsDedupeResult({ kept: dedupeRes.kept, removed: dedupeRes.removed });

            const [runRes, itemRes] = await Promise.all([
                questionOpsApi.getRun(questionOpsRunId),
                questionOpsApi.getItems(questionOpsRunId),
            ]);
            setQuestionOpsSummary((runRes.run?.summary || null) as any);
            setQuestionOpsItems((itemRes.items || []) as any);
            showToast(`Dedupe complete. Kept ${dedupeRes.kept}, removed ${dedupeRes.removed}.`, 'success');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : 'Failed to apply dedupe';
            setQuestionOpsError(msg);
            showToast(msg, 'error');
        } finally {
            setQuestionOpsDedupeLoading(false);
        }
    };

    return {
        questionOpsRunId,
        questionOpsSummary,
        questionOpsItems,
        questionOpsLoading,
        questionOpsError,
        questionOpsThreshold, setQuestionOpsThreshold,
        questionOpsSort, setQuestionOpsSort,
        questionOpsDuplicatesOnly, setQuestionOpsDuplicatesOnly,
        questionOpsTagFilter, setQuestionOpsTagFilter,
        questionOpsDedupeResult,
        questionOpsDedupeLoading,
        runQuestionOps,
        applyQuestionOpsDedupe,
    };
}
