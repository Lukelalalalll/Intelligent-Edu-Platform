import { useCallback } from 'react';
import { gmailApi } from '../../../api/emailApi';
import type { EmailDetail, EmailSummary, EmailClassification } from '../../../types/api';
import type { AIProvider } from '../../../shared/aiProvider';
import {
    buildClassifyPayload,
    buildSuggestPayload,
    extractError,
    normalizeReplySubject,
    parseSenderEmail,
} from './helpers';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export function useEmailActions({
    selectedProvider,
    selectedEmailDetail,
    selectedEmailId,
    replyBody,
    aiProvider,
    nextPageToken,
    isLoadingMore,
    resetSelection,
    setIsLoading,
    setError,
    setEmails,
    setIsConnected,
    setNextPageToken,
    setSelectedEmailId,
    setIsLoadingMore,
    setIsClassifying,
    setClassifyFailed,
    setEmailClassification,
    setIsDetailLoading,
    setSelectedEmailDetail,
    setIsConnecting,
    setIsReplying,
    setReplyBody,
    setIsSendingReply,
    setIsSuggestingReply,
    showSuccess,
}: {
    selectedProvider: string;
    selectedEmailDetail: EmailDetail | null;
    selectedEmailId: string;
    replyBody: string;
    aiProvider: AIProvider;
    nextPageToken: string | null;
    isLoadingMore: boolean;
    resetSelection: () => void;
    setIsLoading: SetState<boolean>;
    setError: SetState<string>;
    setEmails: SetState<EmailSummary[]>;
    setIsConnected: SetState<boolean>;
    setNextPageToken: SetState<string | null>;
    setSelectedEmailId: SetState<string>;
    setIsLoadingMore: SetState<boolean>;
    setIsClassifying: SetState<boolean>;
    setClassifyFailed: SetState<boolean>;
    setEmailClassification: SetState<EmailClassification | null>;
    setIsDetailLoading: SetState<boolean>;
    setSelectedEmailDetail: SetState<EmailDetail | null>;
    setIsConnecting: SetState<boolean>;
    setIsReplying: SetState<boolean>;
    setReplyBody: SetState<string>;
    setIsSendingReply: SetState<boolean>;
    setIsSuggestingReply: SetState<boolean>;
    showSuccess: (msg: string) => void;
}) {
    const classifyEmail = useCallback(async (emailId: string, detail: EmailDetail | null) => {
        setIsClassifying(true);
        setClassifyFailed(false);
        try {
            const payload = buildClassifyPayload(emailId, detail, aiProvider);
            const data = await gmailApi.classify(payload);
            setEmailClassification(data.classification || null);
        } catch {
            setEmailClassification(null);
            setClassifyFailed(true);
        } finally {
            setIsClassifying(false);
        }
    }, [aiProvider, setIsClassifying, setClassifyFailed, setEmailClassification]);

    const loadEmailDetail = useCallback(async (emailId: string) => {
        if (!emailId) {
            setSelectedEmailDetail(null);
            setEmailClassification(null);
            return;
        }
        setIsDetailLoading(true);
        setEmailClassification(null);
        setClassifyFailed(false);
        try {
            const data = await gmailApi.getDetail(emailId);
            const detail = data.email || null;
            setSelectedEmailDetail(detail);
            await classifyEmail(emailId, detail);
        } catch (err) {
            setError(extractError(err, 'Failed to fetch email detail.'));
            setSelectedEmailDetail(null);
        } finally {
            setIsDetailLoading(false);
        }
    }, [setSelectedEmailDetail, setEmailClassification, setIsDetailLoading, setClassifyFailed, setError, classifyEmail]);

    const loadEmails = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await gmailApi.list();
            const list = data.emails || [];
            setEmails(list);
            setIsConnected(true);
            setNextPageToken(data.nextPageToken || null);
            if (list.length === 0) {
                resetSelection();
                return;
            }
            setSelectedEmailId((prev) => (list.some((m) => m.id === prev) ? prev : list[0].id));
        } catch (err: any) {
            const status = err?.response?.status;
            if (status === 400) {
                setIsConnected(false);
            } else {
                setError(extractError(err, 'Failed to fetch emails.'));
            }
            setEmails([]);
            resetSelection();
        } finally {
            setIsLoading(false);
        }
    }, [setIsLoading, setError, setEmails, setIsConnected, setNextPageToken, resetSelection, setSelectedEmailId]);

    const loadMore = useCallback(async () => {
        if (!nextPageToken || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const data = await gmailApi.list(nextPageToken);
            setEmails((prev) => [...prev, ...(data.emails || [])]);
            setNextPageToken(data.nextPageToken || null);
        } catch (err) {
            setError(extractError(err, 'Failed to load more emails.'));
        } finally {
            setIsLoadingMore(false);
        }
    }, [nextPageToken, isLoadingMore, setIsLoadingMore, setEmails, setNextPageToken, setError]);

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError('');
        try {
            const data = await gmailApi.getAuthUrl();
            if (!data.auth_url) throw new Error('Missing auth url');
            globalThis.location.href = data.auth_url;
        } catch (err) {
            setError(extractError(err, 'Failed to start Gmail OAuth.'));
            setIsConnecting(false);
        }
    }, [setIsConnecting, setError]);

    const disconnect = useCallback(async () => {
        setError('');
        try {
            await gmailApi.disconnect();
            setIsConnected(false);
            setEmails([]);
            resetSelection();
            showSuccess('Gmail disconnected.');
        } catch (err) {
            setError(extractError(err, 'Failed to disconnect Gmail.'));
        }
    }, [setError, setIsConnected, setEmails, resetSelection, showSuccess]);

    const sendReply = useCallback(async () => {
        if (!selectedEmailId || !replyBody.trim() || !selectedEmailDetail) return;
        setIsSendingReply(true);
        setError('');
        try {
            const senderEmail = parseSenderEmail(selectedEmailDetail.from);
            const subject = normalizeReplySubject(selectedEmailDetail.subject);
            await gmailApi.reply({
                threadId: selectedEmailDetail.threadId,
                messageId: selectedEmailId,
                to: senderEmail,
                subject,
                body: replyBody,
                inReplyTo: selectedEmailDetail.messageIdHeader || undefined,
            });
            setIsReplying(false);
            setReplyBody('');
            showSuccess('Reply sent successfully!');
        } catch (err) {
            setError(extractError(err, 'Failed to send reply.'));
        } finally {
            setIsSendingReply(false);
        }
    }, [selectedEmailId, replyBody, selectedEmailDetail, setIsSendingReply, setError, setIsReplying, setReplyBody, showSuccess]);

    const suggestReply = useCallback(async () => {
        if (!selectedEmailId) return;
        setIsSuggestingReply(true);
        setError('');
        try {
            const payload = buildSuggestPayload(selectedEmailDetail, aiProvider);
            const data = await gmailApi.suggestReply(selectedEmailId, payload);
            if (data.suggestion) setReplyBody(data.suggestion);
        } catch (err) {
            setError(extractError(err, 'Failed to generate AI reply suggestion.'));
        } finally {
            setIsSuggestingReply(false);
        }
    }, [selectedEmailId, selectedEmailDetail, aiProvider, setIsSuggestingReply, setError, setReplyBody]);

    const selectProvider = useCallback((id: string) => {
        if (selectedProvider === id) return;
        if (id === 'gmail') {
            void loadEmails();
        }
    }, [selectedProvider, loadEmails]);

    return {
        loadEmails,
        loadMore,
        classifyEmail,
        loadEmailDetail,
        connect,
        disconnect,
        sendReply,
        suggestReply,
        selectProvider,
    };
}
