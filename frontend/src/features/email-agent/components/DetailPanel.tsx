import React from 'react';
import { formatFullDate } from '../utils/emailUtils';
import ClassificationBadges from './ClassificationBadges';
import EntitiesDisplay from './EntitiesDisplay';
import EmailBodyContent from './EmailBodyContent';
import ReplySection from './ReplySection';
import type { EmailListItem } from './EmailListPanel';
import styles from '../styles/EmailAgent.module.css';

interface DetailPanelProps {
    selectedListItem?: EmailListItem | null;
    isDetailLoading?: boolean;
    selectedSubject?: string;
    selectedDate?: string;
    selectedFrom?: string;
    senderInitial?: string;
    senderDisplay?: string;
    selectedEmailDetail?: Record<string, any> | null;
    emailClassification?: Record<string, any> | null;
    isClassifying?: boolean;
    classifyFailed?: boolean;
    isLoading?: boolean;
    isReplying?: boolean;
    setIsReplying?: (v: boolean) => void;
    replyBody?: string;
    setReplyBody?: (v: string) => void;
    isSendingReply?: boolean;
    isSuggestingReply?: boolean;
    onSuggestReply?: () => void;
    onSendReply?: () => void;
    onRefresh?: () => void;
}

export default function DetailPanel({
    selectedListItem, isDetailLoading, selectedSubject, selectedDate, selectedFrom,
    senderInitial, senderDisplay, selectedEmailDetail, emailClassification, isClassifying,
    classifyFailed, isLoading, isReplying, setIsReplying, replyBody, setReplyBody,
    isSendingReply, isSuggestingReply, onSuggestReply, onSendReply, onRefresh,
}: DetailPanelProps) {
    if (selectedListItem && isDetailLoading) {
        return <section className={styles.detailPanel}><div className={styles.detailEmpty}>Loading email details...</div></section>;
    }
    if (!selectedListItem) {
        return <section className={styles.detailPanel}><div className={styles.detailEmpty}>Select an email to preview details.</div></section>;
    }
    return (
        <section className={styles.detailPanel}>
            <article className={styles.detailCard}>
                <div className={styles.detailToolbar}>
                    <button type="button" className={styles.toolbarReply} onClick={() => setIsReplying(true)}>Reply</button>
                    <button type="button" className={styles.toolbarRefresh} onClick={onRefresh} disabled={isLoading}>
                        {isLoading ? 'Syncing...' : 'Refresh List'}
                    </button>
                </div>

                <header className={styles.detailHeader}>
                    <h2>{selectedSubject}</h2>
                    <div className={styles.headerMeta}>
                        <time>{formatFullDate(selectedDate)}</time>
                        <ClassificationBadges isClassifying={isClassifying} emailClassification={emailClassification} classifyFailed={classifyFailed} />
                    </div>
                    {emailClassification?.summary && !emailClassification.raw_response ? (
                        <p className={styles.aiSummary}>{emailClassification.summary}</p>
                    ) : null}
                    <EntitiesDisplay emailClassification={emailClassification} />
                    <div className={styles.metaGrid}>
                        <div className={styles.senderAvatar} aria-hidden="true">{senderInitial}</div>
                        <div className={styles.metaTextWrap}>
                            <div className={styles.metaLine}><strong>From:</strong> {selectedFrom}</div>
                            <div className={styles.metaLine}><strong>To:</strong> {selectedEmailDetail?.to || '-'}</div>
                            {selectedEmailDetail?.cc ? <div className={styles.metaLine}><strong>Cc:</strong> {selectedEmailDetail.cc}</div> : null}
                        </div>
                    </div>
                </header>

                <div className={styles.bodyWrap}>
                    <EmailBodyContent selectedEmailDetail={selectedEmailDetail} fallbackSnippet={selectedListItem.snippet} />
                </div>

                <ReplySection
                    isReplying={isReplying} setIsReplying={setIsReplying}
                    replyBody={replyBody} setReplyBody={setReplyBody}
                    isSendingReply={isSendingReply} isSuggestingReply={isSuggestingReply}
                    onSuggestReply={onSuggestReply} onSendReply={onSendReply}
                    senderDisplay={senderDisplay}
                />
            </article>
        </section>
    );
}
