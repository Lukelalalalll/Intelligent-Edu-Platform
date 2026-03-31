import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cozeApi } from '../services/api';
import { useLLMStream } from '../hooks/useLLMStream';
import { usePretextMeasure } from '../hooks/usePretextMeasure';

export default function CozeAssistant({ submissionId, assignment, rubric, onAnalysis, className }) {
    const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hi! I can help you grade, generate rubric scores, or suggest annotations.' }]);
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

    // Pretext: reflow-free scroll management
    const { scrollToBottom } = usePretextMeasure(chatAreaRef, {
        font: '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 22.4, // 14px * 1.6
        debounceMs: 60,
    });

    useEffect(() => {
        setLocalError('');
        clearError();
        setLastRagInfo(null);
    }, [submissionId, clearError]);

    useEffect(() => {
        scrollToBottom(/* immediate */ !loading);
    }, [messages, loading, scrollToBottom]);

    const appendMessage = (role, content) => setMessages((prev) => [...prev, { role, content }]);

    const tryParseAnalysisJson = (rawText) => {
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
                try {
                    return JSON.parse(withoutFence.slice(first, last + 1));
                } catch {
                    return null;
                }
            }
            return null;
        }
    };

    const formatAnalyzeResponse = (rawText) => {
        const parsed = tryParseAnalysisJson(rawText);
        if (!parsed) return String(rawText || 'Analysis complete');

        const overallScore = parsed.overall_score;
        const overallFeedback = String(parsed.overall_feedback || '').trim();
        const rubricScores = Array.isArray(parsed.rubric_scores) ? parsed.rubric_scores : [];
        const suggestions = Array.isArray(parsed.improvement_suggestions) ? parsed.improvement_suggestions : [];

        const lines = [];
        lines.push('Analysis Result');
        if (typeof overallScore === 'number') {
            lines.push(`Overall Score: ${overallScore}/100`);
        }
        if (overallFeedback) {
            lines.push('', 'Overall Feedback:', overallFeedback);
        }
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

    const handleAsk = async (overrideQuestion) => {
        const source = typeof overrideQuestion === 'string' ? overrideQuestion : input;
        if (!source.trim()) return;
        const question = source.trim();

        const userMessage = { role: 'user', content: question };
        const streamInputMessages = [...messages, userMessage];
        setMessages([...streamInputMessages, { role: 'assistant', content: '' }]);
        setInput('');
        setLocalError('');
        try {
            setLastRagInfo({ enabled: false, retrieved_count: 0 });

            await startStream({
                question,
                payload: {
                    submissionId,
                    selectedText: question,
                    assignment: assignment?.description,
                    rubric,
                    messages: streamInputMessages,
                    useRag: true,
                    ragTopK: 4,
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
        } catch (err) {
            if (err?.name !== 'AbortError') {
                setLocalError('Stream request failed unexpectedly.');
            }
        }
    };

    const handleStop = () => {
        stopStream();
    };

    const handleAnalyze = async () => {
        setAnalyzeLoading(true);
        try {
            const res = await cozeApi.analyzeSubmission(submissionId);
            const rawResponse = res.analysis?.raw_response || 'Analysis complete';
            appendMessage('assistant', formatAnalyzeResponse(rawResponse));
            onAnalysis?.({
                ...res.analysis,
                parsed: tryParseAnalysisJson(rawResponse),
            });
        } catch {
            setLocalError('Analyze request failed');
        } finally {
            setAnalyzeLoading(false);
        }
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
        }
    };

    return (
        <div className={className?.cozeCard || ''} style={className ? undefined : { display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className={className?.cozeHeader || ''}>
                <div>
                    <div className={className?.cozeTitle || ''}><i className="fas fa-robot" /> Coze.ai Assistant</div>
                    <div className={className?.cozeSub || ''}>{assignment?.title}</div>
                </div>
                <div className={className?.cozeActions || ''}>
                    <button onClick={handleAnalyze} disabled={loading || analyzeLoading} className={className?.primaryBtn || ''}>Analyze Submission</button>
                    {loading && (
                        <button type="button" onClick={handleStop} className={className?.ghostBtn || ''}>Stop</button>
                    )}
                </div>
            </div>

            {lastRagInfo?.enabled && (
                <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.85 }}>
                    RAG context chunks: {lastRagInfo.retrieved_count ?? 0}
                </div>
            )}

            {typeof lastLatencyMs === 'number' && (
                <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.75 }}>
                    Last request: {lastLatencyMs} ms
                </div>
            )}

            <div ref={chatAreaRef} className={className?.chatArea || ''}>
                {messages.map((m, idx) => {
                    if (m.role === 'assistant' && !String(m.content || '').trim()) return null;
                    return (
                        <div key={`${m.role}-${idx}`} className={`${className?.msg || ''} ${m.role === 'user' ? className?.msgUser : className?.msgAssistant}`}>
                            <div className={className?.msgAvatar || ''}>
                                <i className={m.role === 'user' ? 'fas fa-user' : 'fas fa-robot'} />
                            </div>
                            <div className={className?.msgBubble || ''}>
                                <div className={className?.msgAuthor || ''}>{m.role === 'user' ? 'YOU' : 'ASSISTANT'}</div>
                                <div>{m.content}</div>
                            </div>
                        </div>
                    );
                })}

                {loading && (
                    <div className={`${className?.msg || ''} ${className?.msgAssistant || ''}`}>
                        <div className={className?.msgAvatar || ''}>
                            <i className="fas fa-robot" />
                        </div>
                        <div className={`${className?.msgBubble || ''} ${className?.typingBubble || ''}`}>
                            <div className={className?.typingDots || ''}>
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {(streamError || localError) && (
                <div style={{ color: '#c0392b', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{streamError || localError}</span>
                    {!!lastFailedQuestion && (
                        <button
                            type="button"
                            onClick={() => handleAsk(lastFailedQuestion)}
                            disabled={loading || analyzeLoading}
                            className={className?.primaryBtn || ''}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            <div className={className?.inputRow || ''}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your grading query... (Enter to send)"
                    className={className?.textInput || ''}
                    onKeyDown={handleInputKeyDown}
                    rows={1}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                />
                <button onClick={handleAsk} disabled={loading || analyzeLoading} className={className?.sendBtn || className?.primaryBtn || ''} title="Send">
                    <i className="fas fa-paper-plane" />
                </button>
                <button type="button" onClick={handleStop} disabled={!loading} className={className?.stopBtn || className?.ghostBtn || ''} title="Stop">
                    <i className="fas fa-stop" />
                </button>
            </div>
            <div className={className?.inputHint || ''}>AI can make mistakes. Please verify important grading decisions.</div>
        </div>
    );
}

CozeAssistant.propTypes = {
    submissionId: PropTypes.string,
    assignment: PropTypes.shape({
        title: PropTypes.string,
        description: PropTypes.string,
    }),
    rubric: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    onAnalysis: PropTypes.func,
    className: PropTypes.shape({
        cozeCard: PropTypes.string,
        cozeHeader: PropTypes.string,
        cozeTitle: PropTypes.string,
        cozeSub: PropTypes.string,
        cozeActions: PropTypes.string,
        primaryBtn: PropTypes.string,
        ghostBtn: PropTypes.string,
        chatArea: PropTypes.string,
        msg: PropTypes.string,
        msgUser: PropTypes.string,
        msgAssistant: PropTypes.string,
        msgAvatar: PropTypes.string,
        msgBubble: PropTypes.string,
        msgAuthor: PropTypes.string,
        typingBubble: PropTypes.string,
        typingDots: PropTypes.string,
        inputRow: PropTypes.string,
        textInput: PropTypes.string,
        sendBtn: PropTypes.string,
        stopBtn: PropTypes.string,
        inputHint: PropTypes.string,
    }),
};
