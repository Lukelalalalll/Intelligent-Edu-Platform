import React, { useMemo, useState } from 'react';
import { RenderedMarkdown } from '@/shared/markdown';
import styles from '../../styles/AIMessage.module.css';
import type { RagCitation } from '../../../../types/api';
import { useTypewriter } from '../../hooks/useTypewriter';
import CitationPanel from './CitationPanel';

interface AIMessageBubbleProps {
    content: string;
    reasoning?: string;
    citations?: RagCitation[];
    isCourseRelevant?: boolean;
    isTyping: boolean;
    isLastAssistant: boolean;
    onCopy: (text: string, element: HTMLElement | null) => void;
    onRegenerate: () => void;
}

function ThinkingIndicator() {
    return (
        <span className={styles['thinking-spinner']}>
            <span className={styles.dot}></span>
            <span className={styles.dot}></span>
            <span className={styles.dot}></span>
        </span>
    );
}

export default function AIMessageBubble({
    content,
    reasoning,
    citations,
    isCourseRelevant,
    isTyping,
    isLastAssistant,
    onCopy,
    onRegenerate,
}: AIMessageBubbleProps) {
    const isStreaming = isTyping && isLastAssistant;
    const displayedContent = useTypewriter(content, isStreaming);
    const stillTyping = isStreaming || displayedContent !== content;
    const [reasoningCollapsed, setReasoningCollapsed] = useState(false);

    const reasoningLabel = useMemo(() => {
        if (isStreaming && !content) {
            return '娣卞害鎬濊€冧腑...';
        }

        return '宸插畬鎴愭繁搴︽€濊€?';
    }, [content, isStreaming]);

    const hasReasoning = Boolean(reasoning);

    return (
        <div className={styles.bubble} style={{ minHeight: '20px' }}>
            {hasReasoning && (
                <div
                    className={[
                        styles['reasoning-box'],
                        content && !isStreaming ? styles['reasoning-done'] : '',
                        reasoningCollapsed ? styles['reasoning-collapsed'] : '',
                    ].filter(Boolean).join(' ')}
                >
                    <button
                        className={styles['reasoning-toggle']}
                        onClick={() => setReasoningCollapsed((value) => !value)}
                    >
                        <span className={styles['reasoning-toggle-icon']}>
                            {isStreaming && !content ? <ThinkingIndicator /> : <i className="fas fa-brain" />}
                        </span>
                        <span className={styles['reasoning-toggle-label']}>{reasoningLabel}</span>
                        <i
                            className={`fas fa-chevron-${reasoningCollapsed ? 'down' : 'up'}`}
                            style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.6 }}
                        />
                    </button>
                    {!reasoningCollapsed && (
                        <div className={styles['reasoning-content']}>
                            <span className={styles['reasoning-text']}>{reasoning}</span>
                        </div>
                    )}
                </div>
            )}

            {displayedContent ? (
                <>
                    <RenderedMarkdown
                        content={displayedContent}
                        isStreaming={isStreaming}
                        deferHighlightDuringStreaming
                        className={`${styles['markdown-body']} markdown-body`}
                    />
                    {stillTyping && <span className={styles['typing-cursor']} />}
                </>
            ) : (
                !hasReasoning && <div style={{ color: '#999', fontStyle: 'italic' }}></div>
            )}

            {citations && citations.length > 0 && (
                <CitationPanel citations={citations} isCourseRelevant={isCourseRelevant} />
            )}

            {content && (
                <div className={styles['message-actions']}>
                    <button className={styles['msg-action-btn']} onClick={(event) => onCopy(content, event.currentTarget)}>
                        <i className="far fa-copy"></i> Copy text
                    </button>
                    {isLastAssistant && !isTyping && (
                        <button className={styles['msg-action-btn']} onClick={onRegenerate}>
                            <i className="fas fa-sync-alt"></i> Regenerate
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
