import React from 'react';
import styles from '../styles/EmailAgent.module.css';

interface ReplySectionProps {
    isReplying: boolean;
    setIsReplying: (v: boolean) => void;
    replyBody: string;
    setReplyBody: (v: string) => void;
    isSendingReply: boolean;
    isSuggestingReply: boolean;
    onSuggestReply: () => void;
    onSendReply: () => void;
    senderDisplay: string;
}

export default function ReplySection({
    isReplying, setIsReplying, replyBody, setReplyBody,
    isSendingReply, isSuggestingReply, onSuggestReply, onSendReply, senderDisplay,
}: ReplySectionProps) {
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
