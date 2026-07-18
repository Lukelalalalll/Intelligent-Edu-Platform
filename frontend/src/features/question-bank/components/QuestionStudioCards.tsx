import React from 'react';

import Button from '@/shared/components/Button/Button';

import styles from '../styles/questionStudio.module.css';

export type QuestionStudioHistoryItem = {
    id: string | number;
    created_at?: string | number | Date;
    preview?: string;
    params?: {
        question_type?: string;
        num_questions?: number;
        difficulty?: number;
        output_language?: string;
        source_kind?: string;
        source_type?: string;
        page_numbers?: number[];
        effective_model?: string;
    };
};

export function EntryCard({
    title,
    description,
    badge,
    icon,
    onClick,
    disabled = false,
    actionLabel,
}: {
    title: string;
    description: string;
    badge: string;
    icon: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    actionLabel: string;
}) {
    return (
        <div
            className={[
                styles.entryCard,
                onClick && !disabled ? styles.entryCardInteractive : '',
                disabled ? styles.entryCardDisabled : '',
            ].filter(Boolean).join(' ')}
        >
            <div className={styles.entryTop}>
                <div className={styles.entryIcon}>{icon}</div>
                <span className={styles.entryBadge}>{badge}</span>
            </div>
            <div>
                <h2 className={styles.entryTitle}>{title}</h2>
                <p className={styles.entryText}>{description}</p>
            </div>
            <div>
                <Button type="button" onClick={onClick} disabled={disabled}>
                    {actionLabel}
                </Button>
            </div>
        </div>
    );
}

export function HistoryStrip({
    items,
    loading,
    onOpen,
}: {
    items: QuestionStudioHistoryItem[];
    loading: boolean;
    onOpen: (historyId: string) => void;
}) {
    return (
        <section className={styles.hubSection}>
            <div className={styles.sectionHeader}>
                <div>
                    <h2 className={styles.sectionTitle}>History</h2>
                    <p className={styles.sectionText}>Recent generated question sets, ready to reopen.</p>
                </div>
            </div>

            {loading ? (
                <div className={styles.emptyState}>Loading question history...</div>
            ) : items.length === 0 ? (
                <div className={styles.emptyState}>No generated question sets yet.</div>
            ) : (
                <div className={styles.historyStrip}>
                    {items.map((item) => (
                        <div key={String(item.id)} className={styles.historyCard}>
                            <div className={styles.historyTop}>
                                <div>
                                    <span className={styles.historyBadge}>
                                        {String(item.params?.question_type || 'Question set')}
                                    </span>
                                    <h3 className={styles.panelTitle} style={{ marginTop: 10 }}>
                                        {Number(item.params?.num_questions || 0) || '?'} questions
                                    </h3>
                                </div>
                                <span className={styles.metaPill}>
                                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown date'}
                                </span>
                            </div>
                            <div className={styles.historyMeta}>
                                <span className={styles.metaPill}>Lv {String(item.params?.difficulty || '-')}</span>
                                <span className={styles.metaPill}>{String(item.params?.output_language || 'English')}</span>
                                <span className={styles.metaPill}>{String(item.params?.source_kind || item.params?.source_type || 'text')}</span>
                                {Array.isArray(item.params?.page_numbers) && item.params.page_numbers.length > 0 ? (
                                    <span className={styles.metaPill}>{item.params.page_numbers.length} page(s)</span>
                                ) : null}
                                {item.params?.effective_model ? (
                                    <span className={styles.metaPill}>{String(item.params.effective_model)}</span>
                                ) : null}
                            </div>
                            <p className={styles.historyPreview}>{String(item.preview || '').trim() || 'No preview available.'}</p>
                            <div>
                                <Button type="button" variant="outline" onClick={() => onOpen(String(item.id))}>
                                    Open Result
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
