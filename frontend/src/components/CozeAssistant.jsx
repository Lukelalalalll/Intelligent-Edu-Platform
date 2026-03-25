import { useEffect, useRef, useState } from 'react';
import { cozeApi } from '../services/api';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

export default function CozeAssistant({ submissionId, assignment, rubric, onAnalysis, className }) {
    const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hi! I can help you grade, generate rubric scores, or suggest annotations.' }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastRagInfo, setLastRagInfo] = useState(null);
    const [lastLatencyMs, setLastLatencyMs] = useState(null);
    const [lastFailedQuestion, setLastFailedQuestion] = useState('');
    const abortControllerRef = useRef(null);
    const chatAreaRef = useRef(null);

    useEffect(() => {
        setError('');
        setLastRagInfo(null);
        setLastLatencyMs(null);
        setLastFailedQuestion('');
    }, [submissionId]);

    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const appendMessage = (role, content) => setMessages((prev) => [...prev, { role, content }]);

    const handleAsk = async (overrideQuestion) => {
        const source = typeof overrideQuestion === 'string' ? overrideQuestion : input;
        if (!source.trim()) return;
        const question = source.trim();
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const nextMessages = [...messages, { role: 'user', content: question }, { role: 'assistant', content: '' }];
        setMessages(nextMessages);
        setInput('');
        setLoading(true);
        setError('');
        const startedAt = performance.now();
        try {
            // Preflight retrieval count for UI visibility.
            try {
                const ragDebug = await cozeApi.debugRag(submissionId, question, { useRag: true, ragTopK: 4 });
                if (ragDebug) {
                    setLastRagInfo({
                        enabled: true,
                        retrieved_count: ragDebug.retrieved_count || 0,
                    });
                }
            } catch {
                // Non-blocking: stream can still proceed without debug info.
            }

            const response = await fetch(`${apiRoot}/api/ai/feedback/stream`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    submissionId,
                    selectedText: question,
                    assignment: assignment?.description,
                    rubric,
                    messages: nextMessages,
                    useRag: true,
                    ragTopK: 4,
                }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`stream failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let aiFullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const dataStr = trimmed.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;

                    try {
                        const dataObj = JSON.parse(dataStr);
                        if (dataObj.error) {
                            aiFullResponse += `\n\n[Error]: ${dataObj.error}`;
                        } else if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                            aiFullResponse += dataObj.choices[0].delta.content;
                        }

                        setMessages((prev) => {
                            const updated = [...prev];
                            if (!updated.length) return updated;
                            updated[updated.length - 1] = {
                                ...updated[updated.length - 1],
                                content: aiFullResponse,
                            };
                            return updated;
                        });
                    } catch {
                        // Ignore non-JSON keepalive frames.
                    }
                }
            }

            setLastLatencyMs(Math.round(performance.now() - startedAt));
            setLastFailedQuestion('');
        } catch (err) {
            if (err?.name === 'AbortError') {
                setError('Request stopped.');
                setMessages((prev) => {
                    if (!prev.length) return prev;
                    const last = prev[prev.length - 1];
                    if (last.role === 'assistant' && !String(last.content || '').trim()) {
                        return prev.slice(0, -1);
                    }
                    return prev;
                });
                return;
            }
            const detail = err?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : err?.message;
            setLastLatencyMs(Math.round(performance.now() - startedAt));
            setLastFailedQuestion(question);
            const text = message || 'unknown error';
            const hint = /timeout|timed out/i.test(text)
                ? ' Timeout occurred. You can retry now.'
                : ' Network or upstream issue. You can retry now.';
            setError(`AI request failed: ${text}.${hint}`);
            setMessages((prev) => {
                if (!prev.length) return prev;
                const last = prev[prev.length - 1];
                if (last.role === 'assistant' && !String(last.content || '').trim()) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setLoading(false);
    };

    const handleAnalyze = async () => {
        setLoading(true);
        try {
            const res = await cozeApi.analyzeSubmission(submissionId);
            appendMessage('assistant', res.analysis?.raw_response || 'Analysis complete');
            onAnalysis?.(res.analysis);
        } catch (err) {
            setError('Analyze request failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={className?.cozeCard || ''} style={!className ? { display: 'flex', flexDirection: 'column', height: '100%' } : undefined}>
            <div className={className?.cozeHeader || ''}>
                <div>
                    <div className={className?.cozeTitle || ''}>Coze.ai Assistant</div>
                    <div className={className?.cozeSub || ''}>{assignment?.title}</div>
                </div>
                <div className={className?.cozeActions || ''}>
                    <button onClick={handleAnalyze} disabled={loading} className={className?.primaryBtn || ''}>Analyze Submission</button>
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
                {messages.map((m, idx) => (
                    <div key={idx} className={`${className?.msg || ''} ${m.role === 'user' ? className?.msgUser : className?.msgAssistant}`}>
                        <div className={className?.msgAuthor || ''}>{m.role.toUpperCase()}</div>
                        <div>{m.content}</div>
                    </div>
                ))}
            </div>

            {error && (
                <div style={{ color: '#c0392b', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{error}</span>
                    {!!lastFailedQuestion && (
                        <button
                            type="button"
                            onClick={() => handleAsk(lastFailedQuestion)}
                            disabled={loading}
                            className={className?.primaryBtn || ''}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            <div className={className?.inputRow || ''}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask the AI about this submission..."
                    className={className?.textInput || ''}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                />
                <button onClick={handleAsk} disabled={loading} className={className?.primaryBtn || ''}>Send</button>
            </div>
        </div>
    );
}
