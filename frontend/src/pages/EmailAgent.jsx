import React from 'react';
import styles from '../styles/EmailAgent.module.css';

function formatShortDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            const parts = dateStr.split(' ');
            if (parts.length > 2) return parts.slice(1, 3).join(' ');
            return dateStr.slice(0, 10);
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

function formatFullDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export default function EmailAgent({
    onConnect,
    onRefresh,
    onSelectEmail,
    onSendReply,
    isReplying,
    setIsReplying,
    replyBody,
    setReplyBody,
    isSendingReply,
    emails,
    isLoading,
    isDetailLoading,
    isConnecting,
    isConnected,
    selectedEmailId,
    selectedEmailDetail,
    error,
}) {
    const selectedListItem = emails.find((mail) => mail.id === selectedEmailId) || null;
    const selectedSubject = selectedEmailDetail?.subject || selectedListItem?.subject || '(No Subject)';
    const selectedFrom = selectedEmailDetail?.from || selectedListItem?.from || '-';
    const selectedDate = selectedEmailDetail?.date || selectedListItem?.date || '-';

    const senderDisplay = selectedFrom
        ? selectedFrom.split('<')[0].replace(/"/g, '').trim() || selectedFrom
        : '-';

    const senderInitial = senderDisplay && senderDisplay !== '-' ? senderDisplay[0].toUpperCase() : '?';

    return (
        <div className={styles.page}>
            <div className={styles.bgOrbA}></div>
            <div className={styles.bgOrbB}></div>

            <div className={styles.shell}>
                <div className={styles.headerCard}>
                    <div className={styles.brandBlock}>
                        <h1>AI Email Agent</h1>
                        <p>Outlook-style workspace for reading, triaging, and replying with AI assistance.</p>
                    </div>

                    <div className={styles.actions}>
                        <span className={`${styles.connectionBadge} ${isConnected ? styles.connected : styles.disconnected}`}>
                            {isConnected ? 'Connected' : 'Not connected'}
                        </span>

                        <button
                            type="button"
                            className={styles.connectBtn}
                            onClick={onConnect}
                            disabled={isConnecting || isLoading}
                        >
                            {isConnecting ? 'Redirecting...' : 'Connect Gmail'}
                        </button>

                        <button
                            type="button"
                            className={styles.refreshBtn}
                            onClick={onRefresh}
                            disabled={!isConnected || isLoading}
                        >
                            {isLoading ? 'Syncing...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {error ? <div className={styles.errorBox}>{error}</div> : null}

                <div className={styles.workspace}>
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
                                {isConnected
                                    ? 'No emails found. Click Refresh to sync again.'
                                    : 'Connect Gmail to load your latest emails.'}
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
                                                    <span className={styles.senderName}>{mail.from ? mail.from.split('<')[0].replace(/"/g, '').trim() : '-'}</span>
                                                    <time>{formatShortDate(mail.date)}</time>
                                                </div>
                                                <h3 title={mail.subject}>{mail.subject || '(No Subject)'}</h3>
                                            </div>
                                            <p className={styles.snippet}>{mail.snippet || '-'}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={styles.detailPanel}>
                        {!selectedListItem ? (
                            <div className={styles.detailEmpty}>Select an email to preview details.</div>
                        ) : isDetailLoading ? (
                            <div className={styles.detailEmpty}>Loading email details...</div>
                        ) : (
                            <article className={styles.detailCard}>
                                <div className={styles.detailToolbar}>
                                    <button
                                        type="button"
                                        className={styles.toolbarReply}
                                        onClick={() => setIsReplying(true)}
                                    >
                                        Reply
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.toolbarRefresh}
                                        onClick={onRefresh}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? 'Syncing...' : 'Refresh List'}
                                    </button>
                                </div>

                                <header className={styles.detailHeader}>
                                    <h2>{selectedSubject}</h2>
                                    <time>{formatFullDate(selectedDate)}</time>

                                    <div className={styles.metaGrid}>
                                        <div className={styles.senderAvatar} aria-hidden="true">{senderInitial}</div>
                                        <div className={styles.metaTextWrap}>
                                            <div className={styles.metaLine}><strong>From:</strong> {selectedFrom}</div>
                                            <div className={styles.metaLine}><strong>To:</strong> {selectedEmailDetail?.to || '-'}</div>
                                            {selectedEmailDetail?.cc ? (
                                                <div className={styles.metaLine}><strong>Cc:</strong> {selectedEmailDetail.cc}</div>
                                            ) : null}
                                        </div>
                                    </div>
                                </header>

                                <div className={styles.bodyWrap}>
                                    {selectedEmailDetail?.bodyText ? (
                                        <pre className={styles.plainBody}>{selectedEmailDetail.bodyText}</pre>
                                    ) : selectedEmailDetail?.bodyHtml ? (
                                        <div
                                            className={styles.htmlBody}
                                            dangerouslySetInnerHTML={{ __html: selectedEmailDetail.bodyHtml }}
                                        />
                                    ) : (
                                        <p className={styles.fallbackText}>{selectedEmailDetail?.snippet || selectedListItem.snippet || '-'}</p>
                                    )}
                                </div>

                                <div className={`${styles.replySection} ${isReplying ? styles.replyOpen : ''}`}>
                                    {!isReplying ? (
                                        <button
                                            type="button"
                                            className={styles.replyBtn}
                                            onClick={() => setIsReplying(true)}
                                        >
                                            Reply to sender
                                        </button>
                                    ) : (
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
                                                disabled={isSendingReply}
                                            />

                                            <div className={styles.replyActions}>
                                                <button
                                                    type="button"
                                                    className={styles.cancelBtn}
                                                    onClick={() => {
                                                        setIsReplying(false);
                                                        setReplyBody('');
                                                    }}
                                                    disabled={isSendingReply}
                                                >
                                                    Discard
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.sendBtn}
                                                    onClick={onSendReply}
                                                    disabled={!replyBody.trim() || isSendingReply}
                                                >
                                                    {isSendingReply ? 'Sending...' : 'Send Reply'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </article>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
