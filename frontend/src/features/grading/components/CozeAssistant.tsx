import { useCozeAssistant } from '../hooks/useCozeAssistant';
import type { AIProvider } from '../../../shared/aiProvider';

interface CozeAssistantClassNames {
    cozeCard?: string;
    cozeHeader?: string;
    cozeTitle?: string;
    cozeSub?: string;
    cozeActions?: string;
    primaryBtn?: string;
    ghostBtn?: string;
    chatArea?: string;
    msg?: string;
    msgUser?: string;
    msgAssistant?: string;
    msgAvatar?: string;
    msgBubble?: string;
    msgAuthor?: string;
    typingBubble?: string;
    typingDots?: string;
    inputRow?: string;
    textInput?: string;
    sendBtn?: string;
    stopBtn?: string;
    inputHint?: string;
}

interface CozeAssistantProps {
    submissionId?: string;
    assignment?: { title?: string; description?: string };
    rubric?: Record<string, unknown>;
    onAnalysis?: (analysis: Record<string, unknown>) => void;
    className?: CozeAssistantClassNames;
    provider?: AIProvider;
    setProvider?: (provider: AIProvider) => void;
}

export default function CozeAssistant({ submissionId, assignment, rubric, onAnalysis, className, provider = 'local_ollama', setProvider }: CozeAssistantProps) {
    const {
        messages, input, setInput,
        loading, analyzeLoading, regradeLoading, localError, streamError,
        lastRagInfo, lastLatencyMs, lastFailedQuestion,
        lowConfidenceCount,
        chatAreaRef,
        handleAsk, handleStop, handleAnalyze, handleRegradeLowConfidence, handleInputKeyDown,
    } = useCozeAssistant({ submissionId, assignment, rubric, onAnalysis, provider });

    return (
        <div className={className?.cozeCard || ''} style={className ? undefined : { display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className={className?.cozeHeader || ''}>
                <div>
                    <div className={className?.cozeTitle || ''}><i className="fas fa-robot" /> AI Assistant</div>
                    <div className={className?.cozeSub || ''}>{assignment?.title}</div>
                    {setProvider && (
                        <div style={{ marginTop: 8 }}>
                            <select
                                value={provider}
                                onChange={(e) => setProvider(e.target.value as AIProvider)}
                                style={{ padding: '4px 8px', borderRadius: 8 }}
                            >
                                <option value="coze">Coze</option>
                                <option value="local_ollama">llama3.2</option>
                            </select>
                        </div>
                    )}
                </div>
                <div className={className?.cozeActions || ''}>
                    <button onClick={handleAnalyze} disabled={loading || analyzeLoading} className={className?.primaryBtn || ''}>Analyze Submission</button>
                    <button
                        onClick={handleRegradeLowConfidence}
                        disabled={loading || analyzeLoading || regradeLoading || !lowConfidenceCount}
                        className={className?.ghostBtn || ''}
                        title={lowConfidenceCount ? `Regrade ${lowConfidenceCount} low-confidence question(s)` : 'No low-confidence questions'}
                    >
                        {regradeLoading ? 'Regrading...' : `Regrade Low-Confidence (${lowConfidenceCount || 0})`}
                    </button>
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
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {(streamError || localError) && (
                <div style={{ color: '#c0392b', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{streamError || localError}</span>
                    {!!lastFailedQuestion && (
                        <button type="button" onClick={() => handleAsk(lastFailedQuestion)} disabled={loading || analyzeLoading}
                            className={className?.primaryBtn || ''} style={{ padding: '4px 10px', fontSize: 12 }}>
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
                <button onClick={() => handleAsk()} disabled={loading || analyzeLoading}
                    className={className?.sendBtn || className?.primaryBtn || ''} title="Send">
                    <i className="fas fa-paper-plane" />
                </button>
                <button type="button" onClick={handleStop} disabled={!loading}
                    className={className?.stopBtn || className?.ghostBtn || ''} title="Stop">
                    <i className="fas fa-stop" />
                </button>
            </div>
            <div className={className?.inputHint || ''}>AI can make mistakes. Please verify important grading decisions.</div>
        </div>
    );
}
