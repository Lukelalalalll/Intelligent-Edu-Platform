import React from 'react';
import { formatShortDate, extractSenderName } from '../utils/emailUtils';
import styles from '../styles/EmailList.module.css';

export interface EmailListItem {
    id: string;
    from?: string;
    subject?: string;
    date?: string;
    snippet?: string;
}

interface EmailListPanelProps {
    emails: EmailListItem[];
    selectedEmailId?: string;
    onSelectEmail: (id: string) => void;
    isConnected?: boolean;
    hasMoreEmails?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
}

export default function EmailListPanel({
    emails, selectedEmailId, onSelectEmail,
    isConnected, hasMoreEmails, isLoadingMore, onLoadMore,
}: EmailListPanelProps) {
    return (
        <section className={styles.listPanel}>
            <div className={styles.listHeader}>
                <div>
                    <h2>Inbox</h2>
                    <p>Primary conversations</p>
                </div>
                <span>{emails.length}</span>
            </div>
            {emails.length === 0 ? (
                <div className={styles.emptyState}>
                    {isConnected ? 'No emails found. Click Refresh to sync again.' : 'Connect Gmail to load your latest emails.'}
                </div>
            ) : (
                <ul className={styles.emailList}>
                    {emails.map((mail, index) => (
                        <li key={mail.id} className={styles.emailListItem} style={{ '--item-index': index } as React.CSSProperties}>
                            <button
                                type="button"
                                className={`${styles.emailItem} ${mail.id === selectedEmailId ? styles.activeItem : ''}`}
                                onClick={() => onSelectEmail(mail.id)}
                            >
                                <span className={styles.itemAccent}></span>
                                <div className={styles.rowTop}>
                                    <div className={styles.senderWrap}>
                                        <span className={styles.senderName}>{extractSenderName(mail.from)}</span>
                                        <time>{formatShortDate(mail.date)}</time>
                                    </div>
                                    <h3 title={mail.subject}>{mail.subject || '(No Subject)'}</h3>
                                </div>
                                <p className={styles.snippet}>{mail.snippet || '-'}</p>
                            </button>
                        </li>
                    ))}
                    {hasMoreEmails && (
                        <li className={styles.loadMoreItem}>
                            <button type="button" className={styles.loadMoreBtn} onClick={onLoadMore} disabled={isLoadingMore}>
                                {isLoadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </section>
    );
}
