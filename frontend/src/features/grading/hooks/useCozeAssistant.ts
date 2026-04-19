import { useEffect, useRef, useState, useCallback } from 'react';
import { cozeApi } from '../api/cozeApi';
import { useLLMStream } from '@/shared/hooks/useLLMStream';
import type { ChatMessage, ChatRole } from '../../../types/llm';
import { usePretextMeasure } from '@/shared/hooks/usePretextMeasure';
import type { AIProvider } from '../../../shared/aiProvider';

interface UseCozeAssistantOptions {
    submissionId?: string;
    assignment?: { title?: string; description?: string };
    rubric?: Record<string, unknown>;
    onAnalysis?: (analysis: Record<string, unknown>) => void;
    provider?: AIProvider;
}

export function useCozeAssistant({ submissionId, assignment, rubric, onAnalysis, provider = 'local_ollama' }: UseCozeAssistantOptions) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant' as ChatRole, content: 'Hi! I can help you grade, generate rubric scores, or suggest annotations.' },
    ]);
    const [input, setInput] = useState('');
    const [analyzeLoading, setAnalyzeLoading] = useState(false);
    const [regradeLoading, setRegradeLoading] = useState(false);
    const [localError, setLocalError] = useState('');
    const [lastRagInfo, setLastRagInfo] = useState(null);
    const [lastStructuredReport, setLastStructuredReport] = useState<Record<string, any> | null>(null);
    const {
        loading,
        error: streamError,
        lastLatencyMs,
        lastFailedQuestion,
        startStream,
        stopStream,
        clearError,
    } = useLLMStream();
    const chatAreaRef = useRef(null);

    const { scrollToBottom } = usePretextMeasure(chatAreaRef, {
        font: '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 22.4,
        debounceMs: 60,
    });

    useEffect(() => {
        setLocalError('');
        clearError();
        setLastRagInfo(null);
    }, [submissionId, clearError]);

    useEffect(() => {
        scrollToBottom(!loading);
    }, [messages, loading, scrollToBottom]);

    const appendMessage = (role: ChatRole, content: string) =>
        setMessages((prev) => [...prev, { role, content }]);

    const tryParseAnalysisJson = (rawText: string) => {
        const text = String(rawText || '').trim();
        if (!text) return null;
        const withoutFence = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        try {
            return JSON.parse(withoutFence);
        } catch {
            const first = withoutFence.indexOf('{');
            const last = withoutFence.lastIndexOf('}');
            if (first >= 0 && last > first) {
                try { return JSON.parse(withoutFence.slice(first, last + 1)); } catch { return null; }
            }
            return null;
        }
    };

    const formatAnalyzeResponse = (rawText: string, parsedOverride?: Record<string, any> | null) => {
        const parsed = parsedOverride || tryParseAnalysisJson(rawText);
        if (!parsed) return String(rawText || 'Analysis complete');

        const questionGrades = Array.isArray(parsed.question_grades) ? parsed.question_grades : [];
        if (questionGrades.length) {
            const overallScore = typeof parsed.overall_score === 'number'
                ? parsed.overall_score
                : questionGrades.reduce((sum, item) => sum + Number(item?.score || 0), 0);
            const overallFeedback = String(parsed.overall_feedback || '').trim();
            const suggestions = Array.isArray(parsed.improvement_suggestions) ? parsed.improvement_suggestions : [];

            const lines: string[] = [];
            lines.push('Structured Grading Result');
            lines.push(`Overall Score: ${overallScore}/100`);
            lines.push('', 'Question Breakdown:');
            questionGrades.forEach((item) => {
                const qid = String(item?.question_id || 'Q?');
                const score = item?.score ?? '-';
                const maxScore = item?.max_score ?? '-';
                const rationale = String(item?.rationale || '').trim();
                const evidence = String(item?.evidence || '').trim();
                lines.push(`- ${qid}: ${score}/${maxScore}`);
                if (rationale) lines.push(`  Why: ${rationale}`);
                if (evidence) lines.push(`  Evidence: ${evidence}`);
            });
            if (overallFeedback) lines.push('', 'Overall Feedback:', overallFeedback);
            if (suggestions.length) {
                lines.push('', 'Improvement Suggestions:');
                suggestions.forEach((item) => lines.push(`- ${String(item)}`));
            }
            const lowConfidence = Array.isArray(parsed.low_confidence_questions) ? parsed.low_confidence_questions : [];
            if (lowConfidence.length) {
                lines.push('', `Low-Confidence Questions: ${lowConfidence.length}`);
                lowConfidence.forEach((item) => {
                    const qid = String(item?.question_id || 'Q?');
                    const reason = String(item?.reason || 'low_confidence');
                    lines.push(`- ${qid}: ${reason}`);
                });
            }
            return lines.join('\n');
        }

        const overallScore = parsed.overall_score;
        const overallFeedback = String(parsed.overall_feedback || '').trim();
        const rubricScores = Array.isArray(parsed.rubric_scores) ? parsed.rubric_scores : [];
        const suggestions = Array.isArray(parsed.improvement_suggestions) ? parsed.improvement_suggestions : [];

        const lines: string[] = [];
        lines.push('Analysis Result');
        if (typeof overallScore === 'number') lines.push(`Overall Score: ${overallScore}/100`);
        if (overallFeedback) lines.push('', 'Overall Feedback:', overallFeedback);
        if (rubricScores.length) {
            lines.push('', 'Rubric Breakdown:');
            rubricScores.forEach((item) => {
                const criterion = String(item?.criterion || 'Criterion');
                const score = item?.score ?? '-';
                const evidence = String(item?.evidence || '').trim();
                lines.push(`- ${criterion}: ${score}`);
                if (evidence) lines.push(`  Evidence: ${evidence}`);
            });
        }
        if (suggestions.length) {
            lines.push('', 'Improvement Suggestions:');
            suggestions.forEach((item) => lines.push(`- ${String(item)}`));
        }
        return lines.join('\n');
    };

    const handleAsk = useCallback(async (overrideQuestion?: string) => {
        const source = typeof overrideQuestion === 'string' ? overrideQuestion : input;
        if (!source.trim()) return;
        const question = source.trim();

        const userMessage: ChatMessage = { role: 'user' as const, content: question };
        const streamInputMessages: ChatMessage[] = [...messages, userMessage];
        setMessages([...streamInputMessages, { role: 'assistant' as const, content: '' }]);
        setInput('');
        setLocalError('');
        try {
            setLastRagInfo({ enabled: false, retrieved_count: 0 });
            await startStream({
                question,
                payload: {
                    submissionId, selectedText: question,
                    assignment: assignment?.description, rubric,
                    messages: streamInputMessages, useRag: true, ragTopK: 4, provider,
                },
                onDelta: (fullText) => {
                    setMessages((prev) => {
                        const updated = [...prev];
                        const last = updated.at(-1);
                        if (last?.role === 'assistant') {
                            updated[updated.length - 1] = { ...last, content: fullText };
                        } else {
                            updated.push({ role: 'assistant', content: fullText });
                        }
                        return updated;
                    });
                },
                onDone: (fullText) => {
                    if (!String(fullText || '').trim()) {
                        setMessages((prev) => {
                            const updated = [...prev];
                            const last = updated.at(-1);
                            if (last?.role === 'assistant') {
                                updated[updated.length - 1] = { ...last, content: 'No response content.' };
                            }
                            return updated;
                        });
                    }
                },
            });
        } catch (err: any) {
            if (err?.name !== 'AbortError') setLocalError('Stream request failed unexpectedly.');
        }
    }, [input, messages, submissionId, assignment, rubric, startStream, provider]);

    const handleStop = useCallback(() => stopStream(), [stopStream]);

    const handleAnalyze = useCallback(async () => {
        if (!submissionId) {
            setLocalError('No submission selected');
            return;
        }
        setAnalyzeLoading(true);
        try {
            const res = await cozeApi.analyzeSubmission(submissionId, provider);
            const report = res.analysis?.structured_report;
            const rawResponse = res.analysis?.raw_response || (report ? JSON.stringify(report) : 'Analysis complete');
            const parsed = tryParseAnalysisJson(rawResponse) || report || null;
            setLastStructuredReport(parsed);
            appendMessage('assistant', formatAnalyzeResponse(rawResponse, parsed));
            onAnalysis?.({ ...res.analysis, parsed });
        } catch (err: any) {
            const msg = err?.response?.data?.detail
                || err?.response?.data?.message
                || err?.message
                || 'Analyze request failed';
            setLocalError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally {
            setAnalyzeLoading(false);
        }
    }, [submissionId, onAnalysis, provider]);

    const handleRegradeLowConfidence = useCallback(async () => {
        if (!submissionId || !lastStructuredReport) return;

        const questionGrades = Array.isArray(lastStructuredReport.question_grades) ? lastStructuredReport.question_grades : [];
        const answerKey = Array.isArray(lastStructuredReport.answer_key) ? lastStructuredReport.answer_key : [];
        const keyById = new Map(answerKey.map((item) => [String(item?.question_id || ''), item]));

        const lowConfidence = Array.isArray(lastStructuredReport.low_confidence_questions)
            ? lastStructuredReport.low_confidence_questions
            : questionGrades
                .filter((item) => Number(item?.confidence ?? 0) < 0.55)
                .map((item) => ({ question_id: item.question_id, reason: 'low_confidence<0.55' }));

        if (!lowConfidence.length) {
            setLocalError('No low-confidence questions to regrade.');
            return;
        }

        setRegradeLoading(true);
        setLocalError('');
        try {
            const refreshedGrades = [...questionGrades];
            for (const item of lowConfidence) {
                const qid = String(item?.question_id || '').trim();
                const current = refreshedGrades.find((x) => String(x?.question_id || '').trim() === qid);
                if (!current) continue;
                const key = keyById.get(qid);
                const res = await cozeApi.regradeQuestion(
                    submissionId,
                    {
                        questionId: qid,
                        questionText: String(current?.question_text || ''),
                        studentAnswer: String(current?.student_answer || ''),
                        referenceAnswer: String(key?.reference_answer || current?.reference_answer || ''),
                        keyPoints: Array.isArray(key?.key_points) ? key.key_points.map((x: unknown) => String(x)) : [],
                        maxScore: Number(current?.max_score ?? key?.max_score ?? 0),
                        assignment: assignment?.description,
                        rubric,
                    },
                    provider,
                );
                const nextGrade = res?.analysis?.question_grade;
                if (nextGrade && typeof nextGrade === 'object') {
                    const idx = refreshedGrades.findIndex((x) => String(x?.question_id || '').trim() === qid);
                    if (idx >= 0) refreshedGrades[idx] = nextGrade;
                }
            }

            const totalScore = refreshedGrades.reduce((sum, item) => sum + Number(item?.score || 0), 0);
            const totalMax = refreshedGrades.reduce((sum, item) => sum + Number(item?.max_score || 0), 0);
            const nextOverall = totalMax > 0 ? Number(((totalScore / totalMax) * 100).toFixed(2)) : 0;
            const nextReport = {
                ...lastStructuredReport,
                question_grades: refreshedGrades,
                overall_score: nextOverall,
                low_confidence_questions: refreshedGrades
                    .filter((x) => Number(x?.confidence ?? 0) < 0.55)
                    .map((x) => ({ question_id: x.question_id, reason: 'low_confidence<0.55', confidence: x.confidence })),
            };
            setLastStructuredReport(nextReport);
            appendMessage('assistant', formatAnalyzeResponse(JSON.stringify(nextReport), nextReport));
            onAnalysis?.({ parsed: nextReport, structured_report: nextReport, action: 'regrade_low_confidence' });
        } catch {
            setLocalError('Regrade request failed');
        } finally {
            setRegradeLoading(false);
        }
    }, [submissionId, lastStructuredReport, assignment?.description, rubric, provider, onAnalysis]);

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
        }
    }, [handleAsk]);

    return {
        messages, input, setInput,
        loading, analyzeLoading, regradeLoading, localError, streamError,
        lastRagInfo, lastLatencyMs, lastFailedQuestion,
        lowConfidenceCount: Array.isArray(lastStructuredReport?.low_confidence_questions)
            ? lastStructuredReport.low_confidence_questions.length
            : 0,
        chatAreaRef,
        handleAsk, handleStop, handleAnalyze, handleRegradeLowConfidence, handleInputKeyDown,
    };
}
