import { useEffect, useRef, useState, useCallback } from 'react';
import { cozeApi } from '../../api/api';
import { useLLMStream } from '../../hooks/useLLMStream';
import type { ChatMessage, ChatRole } from '../../types/llm';
import { usePretextMeasure } from '../../hooks/usePretextMeasure';

interface UseCozeAssistantOptions {
    submissionId?: string;
    assignment?: { title?: string; description?: string };
    rubric?: Record<string, unknown>;
    onAnalysis?: (analysis: Record<string, unknown>) => void;
}

export function useCozeAssistant({ submissionId, assignment, rubric, onAnalysis }: UseCozeAssistantOptions) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant' as ChatRole, content: 'Hi! I can help you grade, generate rubric scores, or suggest annotations.' },
    ]);
    const [input, setInput] = useState('');
    const [analyzeLoading, setAnalyzeLoading] = useState(false);
    const [localError, setLocalError] = useState('');
    const [lastRagInfo, setLastRagInfo] = useState(null);
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

    const formatAnalyzeResponse = (rawText: string) => {
        const parsed = tryParseAnalysisJson(rawText);
        if (!parsed) return String(rawText || 'Analysis complete');

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
                    messages: streamInputMessages, useRag: true, ragTopK: 4,
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
    }, [input, messages, submissionId, assignment, rubric, startStream]);

    const handleStop = useCallback(() => stopStream(), [stopStream]);

    const handleAnalyze = useCallback(async () => {
        setAnalyzeLoading(true);
        try {
            const res = await cozeApi.analyzeSubmission(submissionId);
            const rawResponse = res.analysis?.raw_response || 'Analysis complete';
            appendMessage('assistant', formatAnalyzeResponse(rawResponse));
            onAnalysis?.({ ...res.analysis, parsed: tryParseAnalysisJson(rawResponse) });
        } catch {
            setLocalError('Analyze request failed');
        } finally {
            setAnalyzeLoading(false);
        }
    }, [submissionId, onAnalysis]);

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
        }
    }, [handleAsk]);

    return {
        messages, input, setInput,
        loading, analyzeLoading, localError, streamError,
        lastRagInfo, lastLatencyMs, lastFailedQuestion,
        chatAreaRef,
        handleAsk, handleStop, handleAnalyze, handleInputKeyDown,
    };
}
