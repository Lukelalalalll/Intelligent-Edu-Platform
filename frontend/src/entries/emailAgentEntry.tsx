import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import EmailAgent from '../features/email-agent/EmailAgent';
import EmailProviderSelect from '../features/email-agent/EmailProviderSelect';
import { useEmailClient } from '../hooks/useEmailClient';

export default function EmailAgentEntry() {
    const email = useEmailClient();

    return (
        <AnimatePresence mode="wait">
            {email.activeProvider === 'select' ? (
                <motion.div
                    key="provider-select"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                >
                    <EmailProviderSelect onSelectProvider={email.selectProvider} />
                </motion.div>
            ) : (
                <motion.div
                    key={`provider-${email.activeProvider}`}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.3 }}
                >
                    <EmailAgent
                        onConnect={email.connect}
                        onDisconnect={email.disconnect}
                        onRefresh={email.loadEmails}
                        onLoadMore={email.loadMore}
                        onSelectEmail={email.setSelectedEmailId}
                        onSendReply={email.sendReply}
                        onSuggestReply={email.suggestReply}
                        isReplying={email.isReplying}
                        setIsReplying={email.setIsReplying}
                        replyBody={email.replyBody}
                        setReplyBody={email.setReplyBody}
                        isSendingReply={email.isSendingReply}
                        isSuggestingReply={email.isSuggestingReply}
                        emails={email.emails}
                        isLoading={email.isLoading}
                        isDetailLoading={email.isDetailLoading}
                        isConnecting={email.isConnecting}
                        isConnected={email.isConnected}
                        selectedEmailId={email.selectedEmailId}
                        selectedEmailDetail={email.selectedEmailDetail}
                        emailClassification={email.emailClassification}
                        isClassifying={email.isClassifying}
                        classifyFailed={email.classifyFailed}
                        error={email.error}
                        setError={email.setError}
                        successMessage={email.successMessage}
                        hasMoreEmails={email.hasMoreEmails}
                        isLoadingMore={email.isLoadingMore}
                        activeProvider={email.activeProvider}
                        onBackToSelect={email.backToSelect}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
