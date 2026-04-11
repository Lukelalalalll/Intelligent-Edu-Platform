// frontend/src/features/chat/components/AssistantPanel.tsx

import React, { useState, useCallback } from 'react';
import { chatApi } from '../../../api/chatApi';
import type { AIProvider } from '../../../shared/aiProvider';
import { useChatStore } from '../store/chatStore';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...sidebarStyles,
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
};

interface Props {
    roomId: string;
    provider: AIProvider;
    visible: boolean;
    onClose: () => void;
    onInsertText?: (text: string) => void;
}

type SummaryMode = 'summary' | 'unread' | 'action_items';

export default function AssistantPanel({ roomId, provider, visible, onClose, onInsertText }: Props) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeMode, setActiveMode] = useState<SummaryMode>('summary');
    const lastSeenAt = useChatStore((s) => s.lastSeenAt[roomId] || undefined);

    // AI Assistant Q&A
    const [question, setQuestion] = useState('');
    const [answerLoading, setAnswerLoading] = useState(false);
    const [answer, setAnswer] = useState<string | null>(null);

    const handleSummary = useCallback(async (mode: SummaryMode) => {
        setActiveMode(mode);
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const unreadSince = mode === 'unread' ? lastSeenAt : undefined;
            const res = await chatApi.aiSummary(roomId, mode, 30, unreadSince, provider);
            setResult(res.summary);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to generate summary';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [roomId, lastSeenAt, provider]);

    const handleAsk = useCallback(async () => {
        if (!question.trim()) return;
        setAnswerLoading(true);
        setAnswer(null);
        setError(null);
        try {
            const res = await chatApi.aiAssistant(roomId, question.trim(), 20, provider);
            setAnswer(res.answer);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to get answer';
            setError(msg);
        } finally {
            setAnswerLoading(false);
        }
    }, [roomId, question, provider]);

    if (!visible) return null;

    return (
        <div className={styles.assistantPanel}>
            <div className={styles.assistantPanelHeader}>
                <i className="fas fa-robot" style={{ marginRight: 8 }} />
                <span>AI Assistant</span>
                <button className={styles.assistantPanelClose} onClick={onClose}>
                    <i className="fas fa-times" />
                </button>
            </div>

            <div className={styles.assistantPanelBody}>
                {/* Summary Section */}
                <div className={styles.assistantSection}>
                    <div className={styles.assistantSectionTitle}>Smart Summary</div>
                    <div className={styles.assistantBtnRow}>
                        <button
                            className={`${styles.assistantBtn} ${activeMode === 'summary' ? styles.assistantBtnActive : ''}`}
                            onClick={() => handleSummary('summary')}
                            disabled={loading}
                        >
                            <i className="fas fa-align-left" /> Summary
                        </button>
                        <button
                            className={`${styles.assistantBtn} ${activeMode === 'unread' ? styles.assistantBtnActive : ''}`}
                            onClick={() => handleSummary('unread')}
                            disabled={loading}
                        >
                            <i className="fas fa-envelope-open-text" /> Unread
                        </button>
                        <button
                            className={`${styles.assistantBtn} ${activeMode === 'action_items' ? styles.assistantBtnActive : ''}`}
                            onClick={() => handleSummary('action_items')}
                            disabled={loading}
                        >
                            <i className="fas fa-tasks" /> Actions
                        </button>
                    </div>
                </div>

                {/* Result Panel */}
                {loading && (
                    <div className={styles.assistantLoading}>
                        <i className="fas fa-circle-notch fa-spin" /> Generating...
                    </div>
                )}

                {error && (
                    <div className={styles.assistantError}>
                        <i className="fas fa-exclamation-triangle" /> {error}
                    </div>
                )}

                {result && !loading && (
                    <div className={styles.assistantResult}>
                        <pre className={styles.assistantResultText}>{result}</pre>
                    </div>
                )}

                {/* Q&A Section */}
                <div className={styles.assistantSection} style={{ marginTop: 16 }}>
                    <div className={styles.assistantSectionTitle}>Ask AI</div>
                    <div className={styles.assistantQaRow}>
                        <input
                            className={styles.assistantQaInput}
                            placeholder="Ask a question about this chat..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
                            disabled={answerLoading}
                        />
                        <button
                            className={styles.assistantBtn}
                            onClick={handleAsk}
                            disabled={answerLoading || !question.trim()}
                        >
                            {answerLoading ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-paper-plane" />}
                        </button>
                    </div>
                    {answer && (
                        <div className={styles.assistantResult} style={{ marginTop: 8 }}>
                            <pre className={styles.assistantResultText}>{answer}</pre>
                            {onInsertText && (
                                <button
                                    className={styles.assistantInsertBtn}
                                    onClick={() => onInsertText(answer)}
                                    title="Insert into message input"
                                >
                                    <i className="fas fa-arrow-down" /> Insert
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
