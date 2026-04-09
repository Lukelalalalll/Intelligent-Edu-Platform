import React from 'react';
import { extractSenderName } from './utils/emailUtils';
import EmailListPanel from './components/EmailListPanel';
import DetailPanel from './components/DetailPanel';
import type { EmailListItem } from './components/EmailListPanel';
import styles from './styles/EmailAgent.module.css';

interface EmailAgentProps {
    onConnect: () => void;
    onDisconnect: () => void;
    onRefresh: () => void;
    onLoadMore: () => void;
    onSelectEmail: (id: string) => void;
    onSendReply: () => void;
    onSuggestReply: () => void;
    isReplying: boolean;
    setIsReplying: (v: boolean) => void;
    replyBody: string;
    setReplyBody: (v: string) => void;
    isSendingReply: boolean;
    isSuggestingReply: boolean;
    emails: EmailListItem[];
    isLoading: boolean;
    isDetailLoading: boolean;
    isConnecting: boolean;
    isConnected: boolean;
    selectedEmailId?: string;
    selectedEmailDetail?: Record<string, any> | null;
    emailClassification?: Record<string, any> | null;
    isClassifying: boolean;
    classifyFailed: boolean;
    error?: string;
    setError: (v: string) => void;
    successMessage?: string;
    hasMoreEmails?: boolean;
    isLoadingMore?: boolean;
    activeProvider?: string;
    onBackToSelect?: () => void;
    aiProvider?: string;
    onChangeAiProvider?: (provider: 'coze' | 'local_ollama') => void;
}

export default function EmailAgent({
    onConnect, onDisconnect, onRefresh, onLoadMore, onSelectEmail, onSendReply, onSuggestReply,
    isReplying, setIsReplying, replyBody, setReplyBody, isSendingReply, isSuggestingReply,
    emails, isLoading, isDetailLoading, isConnecting, isConnected,
    selectedEmailId, selectedEmailDetail, emailClassification, isClassifying, classifyFailed,
    error, setError, successMessage, hasMoreEmails, isLoadingMore,
    activeProvider, onBackToSelect,
    aiProvider, onChangeAiProvider,
}: EmailAgentProps) {
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
                        <select
                            value={aiProvider || 'local_ollama'}
                            onChange={(e) => onChangeAiProvider?.(e.target.value as 'coze' | 'local_ollama')}
                            style={{ borderRadius: 8, padding: '6px 8px' }}
                        >
                            <option value="coze">Coze</option>
                            <option value="local_ollama">llama3.2</option>
                        </select>
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
