import React from 'react';
import PropTypes from 'prop-types';
import DOMPurify from 'dompurify';
import styles from '../styles/EmailAgent.module.css';

function formatShortDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
        const parts = dateStr.split(' ');
        if (parts.length > 2) return parts.slice(1, 3).join(' ');
        return dateStr.slice(0, 10);
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

const URGENCY_COLORS = {
    high: { bg: '#fdecea', color: '#b71c1c', label: 'Urgent' },
    medium: { bg: '#fff3e0', color: '#e65100', label: 'Medium' },
    low: { bg: '#e8f5e9', color: '#2e7d32', label: 'Low' },
};

const CATEGORY_LABELS = {
    assignment: 'Assignment',
    grade_inquiry: 'Grade Inquiry',
    course_logistics: 'Course Logistics',
    administrative: 'Admin',
    personal: 'Personal',
    other: 'Other',
};

function extractSenderName(from) {
    if (!from) return '-';
    return from.split('<')[0].replaceAll('"', '').trim() || from;
}

/* ── Sub-components ─────────────────────────────────────────────── */

function ClassificationBadges({ isClassifying, emailClassification, classifyFailed }) {
    if (isClassifying) {
        return <span className={styles.classifyBadge} style={{ background: '#e3eaf5', color: '#546e8a' }}>Classifying...</span>;
    }
    if (classifyFailed) {
        return <span className={styles.classifyBadge} style={{ background: '#f5f5f5', color: '#9e9e9e' }}>AI classification unavailable</span>;
    }
    if (!emailClassification || emailClassification.raw_response) return null;
    const urgency = URGENCY_COLORS[emailClassification.urgency];
    return (
        <>
            {urgency && (
                <span className={styles.classifyBadge} style={{ background: urgency.bg, color: urgency.color }}>
                    {urgency.label}
                </span>
            )}
            {emailClassification.category && (
                <span className={styles.classifyBadge} style={{ background: '#e8eaf6', color: '#283593' }}>
                    {CATEGORY_LABELS[emailClassification.category] || emailClassification.category}
                </span>
            )}
        </>
    );
}

ClassificationBadges.propTypes = {
    isClassifying: PropTypes.bool,
    emailClassification: PropTypes.object,
    classifyFailed: PropTypes.bool,
};

function EntitiesDisplay({ emailClassification }) {
    if (!emailClassification?.entities || emailClassification.raw_response) return null;
    const { courses, assignments, students } = emailClassification.entities;
    const hasCourses = courses?.length > 0;
    const hasAssignments = assignments?.length > 0;
    const hasStudents = students?.length > 0;
    if (!hasCourses && !hasAssignments && !hasStudents) return null;
    return (
        <div className={styles.entitiesRow}>
            {hasCourses && <span className={styles.entityTag}><strong>Courses:</strong> {courses.join(', ')}</span>}
            {hasAssignments && <span className={styles.entityTag}><strong>Assignments:</strong> {assignments.join(', ')}</span>}
            {hasStudents && <span className={styles.entityTag}><strong>Students:</strong> {students.join(', ')}</span>}
        </div>
    );
}

EntitiesDisplay.propTypes = {
    emailClassification: PropTypes.object,
};

function EmailBodyContent({ selectedEmailDetail, fallbackSnippet }) {
    if (selectedEmailDetail?.bodyText) {
        return <pre className={styles.plainBody}>{selectedEmailDetail.bodyText}</pre>;
    }
    if (selectedEmailDetail?.bodyHtml) {
        return (
            <div
                className={styles.htmlBody}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedEmailDetail.bodyHtml) }}
            />
        );
    }
    return <p className={styles.fallbackText}>{selectedEmailDetail?.snippet || fallbackSnippet || '-'}</p>;
}

EmailBodyContent.propTypes = {
    selectedEmailDetail: PropTypes.object,
    fallbackSnippet: PropTypes.string,
};

function ReplySection({ isReplying, setIsReplying, replyBody, setReplyBody, isSendingReply, isSuggestingReply, onSuggestReply, onSendReply, senderDisplay }) {
    return (
        <div className={`${styles.replySection} ${isReplying ? styles.replyOpen : ''}`}>
            {isReplying ? (
                <div className={styles.replyBox}>
                    <div className={styles.replyHeader}>
                        <h3>New reply</h3>
                        <span>to {senderDisplay}</span>
                    </div>
                    <textarea
                        className={styles.replyInput}
                        placeholder="Write your response..."
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        disabled={isSendingReply || isSuggestingReply}
                    />
                    <div className={styles.replyActions}>
                        <button type="button" className={styles.aiDraftBtn} onClick={onSuggestReply} disabled={isSuggestingReply || isSendingReply}>
                            {isSuggestingReply ? 'AI Generating...' : 'AI Draft'}
                        </button>
                        <button type="button" className={styles.cancelBtn} onClick={() => { setIsReplying(false); setReplyBody(''); }} disabled={isSendingReply}>
                            Discard
                        </button>
                        <button type="button" className={styles.sendBtn} onClick={onSendReply} disabled={!replyBody.trim() || isSendingReply || isSuggestingReply}>
                            {isSendingReply ? 'Sending...' : 'Send Reply'}
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" className={styles.replyBtn} onClick={() => setIsReplying(true)}>
                    Reply to sender
                </button>
            )}
        </div>
    );
}

ReplySection.propTypes = {
    isReplying: PropTypes.bool.isRequired,
    setIsReplying: PropTypes.func.isRequired,
    replyBody: PropTypes.string.isRequired,
    setReplyBody: PropTypes.func.isRequired,
    isSendingReply: PropTypes.bool.isRequired,
    isSuggestingReply: PropTypes.bool.isRequired,
    onSuggestReply: PropTypes.func.isRequired,
    onSendReply: PropTypes.func.isRequired,
    senderDisplay: PropTypes.string.isRequired,
};

function EmailListPanel({ emails, selectedEmailId, onSelectEmail, isConnected, hasMoreEmails, isLoadingMore, onLoadMore }) {
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
                        <li key={mail.id} className={styles.emailListItem} style={{ '--item-index': index }}>
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

EmailListPanel.propTypes = {
    emails: PropTypes.array.isRequired,
    selectedEmailId: PropTypes.string,
    onSelectEmail: PropTypes.func.isRequired,
    isConnected: PropTypes.bool,
    hasMoreEmails: PropTypes.bool,
    isLoadingMore: PropTypes.bool,
    onLoadMore: PropTypes.func,
};

function DetailPanel({
    selectedListItem, isDetailLoading, selectedSubject, selectedDate, selectedFrom,
    senderInitial, senderDisplay, selectedEmailDetail, emailClassification, isClassifying,
    classifyFailed, isLoading, isReplying, setIsReplying, replyBody, setReplyBody,
    isSendingReply, isSuggestingReply, onSuggestReply, onSendReply, onRefresh,
}) {
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

DetailPanel.propTypes = {
    selectedListItem: PropTypes.object,
    isDetailLoading: PropTypes.bool,
    selectedSubject: PropTypes.string,
    selectedDate: PropTypes.string,
    selectedFrom: PropTypes.string,
    senderInitial: PropTypes.string,
    senderDisplay: PropTypes.string,
    selectedEmailDetail: PropTypes.object,
    emailClassification: PropTypes.object,
    isClassifying: PropTypes.bool,
    classifyFailed: PropTypes.bool,
    isLoading: PropTypes.bool,
    isReplying: PropTypes.bool,
    setIsReplying: PropTypes.func,
    replyBody: PropTypes.string,
    setReplyBody: PropTypes.func,
    isSendingReply: PropTypes.bool,
    isSuggestingReply: PropTypes.bool,
    onSuggestReply: PropTypes.func,
    onSendReply: PropTypes.func,
    onRefresh: PropTypes.func,
};

/* ── Main Component ─────────────────────────────────────────────── */

export default function EmailAgent({
    onConnect, onDisconnect, onRefresh, onLoadMore, onSelectEmail, onSendReply, onSuggestReply,
    isReplying, setIsReplying, replyBody, setReplyBody, isSendingReply, isSuggestingReply,
    emails, isLoading, isDetailLoading, isConnecting, isConnected,
    selectedEmailId, selectedEmailDetail, emailClassification, isClassifying, classifyFailed,
    error, setError, successMessage, hasMoreEmails, isLoadingMore,
    activeProvider, onBackToSelect,
}) {
    const selectedListItem = emails.find((mail) => mail.id === selectedEmailId) || null;
    const selectedSubject = selectedEmailDetail?.subject || selectedListItem?.subject || '(No Subject)';
    const selectedFrom = selectedEmailDetail?.from || selectedListItem?.from || '-';
    const selectedDate = selectedEmailDetail?.date || selectedListItem?.date || '-';
    const senderDisplay = extractSenderName(selectedFrom);
    const senderInitial = senderDisplay && senderDisplay !== '-' ? senderDisplay[0].toUpperCase() : '?';

    return (
        <div className={styles.page}>
            <div className={styles.bgOrbA}></div>
            <div className={styles.bgOrbB}></div>

            <div className={styles.shell}>
                <div className={styles.headerCard}>
                    <div className={styles.brandBlock}>
                        {onBackToSelect && (
                            <button type="button" className={styles.backBtn} onClick={onBackToSelect}>
                                <i className="fa fa-arrow-left" /> Switch Provider
                            </button>
                        )}
                        <h1>AI Email Agent</h1>
                        <p>Outlook-style workspace for reading, triaging, and replying with AI assistance.</p>
                    </div>

                    <div className={styles.actions}>
                        <span className={`${styles.connectionBadge} ${isConnected ? styles.connected : styles.disconnected}`}>
                            {isConnected ? 'Connected' : 'Not connected'}
                        </span>
                        <button type="button" className={styles.connectBtn} onClick={onConnect} disabled={isConnecting || isLoading}>
                            {isConnecting ? 'Redirecting...' : 'Connect Gmail'}
                        </button>
                        <button type="button" className={styles.refreshBtn} onClick={onRefresh} disabled={!isConnected || isLoading}>
                            {isLoading ? 'Syncing...' : 'Refresh'}
                        </button>
                        {isConnected && (
                            <button type="button" className={styles.disconnectBtn} onClick={onDisconnect}>Disconnect</button>
                        )}
                    </div>
                </div>

                {error ? (
                    <div className={styles.errorBox}>
                        <span>{error}</span>
                        <button type="button" className={styles.errorClose} onClick={() => setError('')} aria-label="Close">&times;</button>
                    </div>
                ) : null}

                {successMessage ? <div className={styles.successBox}>{successMessage}</div> : null}

                <div className={styles.workspace}>
                    <EmailListPanel
                        emails={emails} selectedEmailId={selectedEmailId} onSelectEmail={onSelectEmail}
                        isConnected={isConnected} hasMoreEmails={hasMoreEmails} isLoadingMore={isLoadingMore} onLoadMore={onLoadMore}
                    />
                    <DetailPanel
                        selectedListItem={selectedListItem} isDetailLoading={isDetailLoading}
                        selectedSubject={selectedSubject} selectedDate={selectedDate} selectedFrom={selectedFrom}
                        senderInitial={senderInitial} senderDisplay={senderDisplay}
                        selectedEmailDetail={selectedEmailDetail} emailClassification={emailClassification}
                        isClassifying={isClassifying} classifyFailed={classifyFailed} isLoading={isLoading}
                        isReplying={isReplying} setIsReplying={setIsReplying}
                        replyBody={replyBody} setReplyBody={setReplyBody}
                        isSendingReply={isSendingReply} isSuggestingReply={isSuggestingReply}
                        onSuggestReply={onSuggestReply} onSendReply={onSendReply} onRefresh={onRefresh}
                    />
                </div>
            </div>
        </div>
    );
}

EmailAgent.propTypes = {
    onConnect: PropTypes.func.isRequired,
    onDisconnect: PropTypes.func.isRequired,
    onRefresh: PropTypes.func.isRequired,
    onLoadMore: PropTypes.func.isRequired,
    onSelectEmail: PropTypes.func.isRequired,
    onSendReply: PropTypes.func.isRequired,
    onSuggestReply: PropTypes.func.isRequired,
    isReplying: PropTypes.bool.isRequired,
    setIsReplying: PropTypes.func.isRequired,
    replyBody: PropTypes.string.isRequired,
    setReplyBody: PropTypes.func.isRequired,
    isSendingReply: PropTypes.bool.isRequired,
    isSuggestingReply: PropTypes.bool.isRequired,
    emails: PropTypes.array.isRequired,
    isLoading: PropTypes.bool.isRequired,
    isDetailLoading: PropTypes.bool.isRequired,
    isConnecting: PropTypes.bool.isRequired,
    isConnected: PropTypes.bool.isRequired,
    selectedEmailId: PropTypes.string,
    selectedEmailDetail: PropTypes.object,
    emailClassification: PropTypes.object,
    isClassifying: PropTypes.bool.isRequired,
    classifyFailed: PropTypes.bool.isRequired,
    error: PropTypes.string,
    setError: PropTypes.func.isRequired,
    successMessage: PropTypes.string,
    hasMoreEmails: PropTypes.bool,
    isLoadingMore: PropTypes.bool,
    activeProvider: PropTypes.string,
    onBackToSelect: PropTypes.func,
};
