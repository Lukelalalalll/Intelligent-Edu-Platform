import { useEffect, useRef, useState } from 'react';
import { cozeApi } from '../services/api';

export default function CozeAssistant({ submissionId, assignment, rubric, onAnalysis, className }) {
    const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hi! I can help you grade, generate rubric scores, or suggest annotations.' }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const chatAreaRef = useRef(null);

    useEffect(() => {
        setError('');
    }, [submissionId]);

    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const appendMessage = (role, content) => setMessages((prev) => [...prev, { role, content }]);

    const handleAsk = async () => {
        if (!input.trim()) return;
        appendMessage('user', input);
        setInput('');
        setLoading(true);
        try {
            const res = await cozeApi.askFeedback(submissionId, input, assignment?.description, rubric);
            appendMessage('assistant', res.feedback || 'No response');
        } catch (err) {
            setError('AI request failed');
        } finally {
            setLoading(false);
        }
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
                </div>
            </div>

            <div ref={chatAreaRef} className={className?.chatArea || ''}>
                {messages.map((m, idx) => (
                    <div key={idx} className={`${className?.msg || ''} ${m.role === 'user' ? className?.msgUser : className?.msgAssistant}`}>
                        <div className={className?.msgAuthor || ''}>{m.role.toUpperCase()}</div>
                        <div>{m.content}</div>
                    </div>
                ))}
            </div>

            {error && <div style={{ color: '#c0392b', marginBottom: 8 }}>{error}</div>}

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
