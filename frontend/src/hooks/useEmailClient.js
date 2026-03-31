import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { gmailApi } from '../services/emailApi';

function extractError(err, fallback) {
    const detail = err?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
}

export function useEmailClient() {
    const location = useLocation();
    const navigate = useNavigate();
    const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const [activeProvider, setActiveProvider] = useState('select');
    const [emails, setEmails] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedEmailId, setSelectedEmailId] = useState('');
    const [selectedEmailDetail, setSelectedEmailDetail] = useState(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Classification
    const [emailClassification, setEmailClassification] = useState(null);
    const [isClassifying, setIsClassifying] = useState(false);
    const [classifyFailed, setClassifyFailed] = useState(false);

    // Reply
    const [isReplying, setIsReplying] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [isSuggestingReply, setIsSuggestingReply] = useState(false);

    // Pagination
    const [nextPageToken, setNextPageToken] = useState(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const showSuccess = useCallback((msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 3000);
    }, []);

    const resetSelection = useCallback(() => {
        setSelectedEmailId('');
        setSelectedEmailDetail(null);
        setEmailClassification(null);
    }, []);

    // ── Core actions ──

    const loadEmails = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await gmailApi.list();
            const list = data.emails || [];
            setEmails(list);
            setIsConnected(true);
            setNextPageToken(data.nextPageToken || null);
            if (list.length === 0) { resetSelection(); return; }
            setSelectedEmailId(prev => list.find(m => m.id === prev) ? prev : list[0].id);
        } catch (err) {
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
    }, [resetSelection]);

    const loadMore = useCallback(async () => {
        if (!nextPageToken || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const data = await gmailApi.list(nextPageToken);
            setEmails(prev => [...prev, ...(data.emails || [])]);
            setNextPageToken(data.nextPageToken || null);
        } catch (err) {
            setError(extractError(err, 'Failed to load more emails.'));
        } finally {
            setIsLoadingMore(false);
        }
    }, [nextPageToken, isLoadingMore]);

    const classifyEmail = useCallback(async (emailId, detail) => {
        setIsClassifying(true);
        setClassifyFailed(false);
        try {
            const payload = { messageId: emailId };
            if (detail) {
                payload.subject = detail.subject || '';
                payload.body = detail.bodyText || detail.snippet || '';
                payload.sender = detail.from || '';
            }
            const data = await gmailApi.classify(payload);
            setEmailClassification(data.classification || null);
        } catch {
            setEmailClassification(null);
            setClassifyFailed(true);
        } finally {
            setIsClassifying(false);
        }
    }, []);

    const loadEmailDetail = useCallback(async (emailId) => {
        if (!emailId) { setSelectedEmailDetail(null); setEmailClassification(null); return; }
        setIsDetailLoading(true);
        setEmailClassification(null);
        setClassifyFailed(false);
        try {
            const data = await gmailApi.getDetail(emailId);
            const detail = data.email || null;
            setSelectedEmailDetail(detail);
            classifyEmail(emailId, detail);
        } catch (err) {
            setError(extractError(err, 'Failed to fetch email detail.'));
            setSelectedEmailDetail(null);
        } finally {
            setIsDetailLoading(false);
        }
    }, [classifyEmail]);

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
    }, []);

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
    }, [resetSelection, showSuccess]);

    const sendReply = useCallback(async () => {
        if (!selectedEmailId || !replyBody.trim() || !selectedEmailDetail) return;
        setIsSendingReply(true);
        setError('');
        try {
            const senderEmail = (selectedEmailDetail.from || '').match(/<([^>]+)>/)?.[1] || selectedEmailDetail.from || '';
            const subject = (selectedEmailDetail.subject || '').replace(/^(Re:\s*)+/i, '').trim();
            await gmailApi.reply({
                threadId: selectedEmailDetail.threadId,
                messageId: selectedEmailId,
                to: senderEmail,
                subject: `Re: ${subject}`,
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
    }, [selectedEmailId, replyBody, selectedEmailDetail, showSuccess]);

    const suggestReply = useCallback(async () => {
        if (!selectedEmailId) return;
        setIsSuggestingReply(true);
        setError('');
        try {
            const payload = {};
            if (selectedEmailDetail) {
                payload.subject = selectedEmailDetail.subject || '';
                payload.body = selectedEmailDetail.bodyText || selectedEmailDetail.snippet || '';
                payload.sender = selectedEmailDetail.from || '';
            }
            const data = await gmailApi.suggestReply(selectedEmailId, payload);
            if (data.suggestion) setReplyBody(data.suggestion);
        } catch (err) {
            setError(extractError(err, 'Failed to generate AI reply suggestion.'));
        } finally {
            setIsSuggestingReply(false);
        }
    }, [selectedEmailId, selectedEmailDetail]);

    // ── OAuth callback handling ──
    useEffect(() => {
        const code = query.get('code');
        const state = query.get('state');
        if (!code) return;
        setActiveProvider('gmail');
        (async () => {
            setIsLoading(true);
            setError('');
            try {
                await gmailApi.callback(code, state);
                await loadEmails();
                navigate('/email-agent', { replace: true });
            } catch (err) {
                setError(extractError(err, 'Failed to complete Gmail OAuth callback.'));
            } finally {
                setIsLoading(false);
                setIsConnecting(false);
            }
        })();
    }, [query, loadEmails, navigate]);

    // ── Auto-load detail on selection change ──
    useEffect(() => {
        if (!selectedEmailId) {
            setSelectedEmailDetail(null);
            setEmailClassification(null);
            setIsReplying(false);
            setReplyBody('');
            return;
        }
        setIsReplying(false);
        setReplyBody('');
        loadEmailDetail(selectedEmailId);
    }, [selectedEmailId, loadEmailDetail]);

    const selectProvider = useCallback((id) => {
        setActiveProvider(id);
        if (id === 'gmail') loadEmails();
    }, [loadEmails]);

    const backToSelect = useCallback(() => setActiveProvider('select'), []);

    return {
        activeProvider, selectProvider, backToSelect,
        emails, isLoading, isConnecting, isConnected,
        selectedEmailId, setSelectedEmailId,
        selectedEmailDetail, isDetailLoading,
        emailClassification, isClassifying, classifyFailed,
        error, setError, successMessage,
        isReplying, setIsReplying, replyBody, setReplyBody,
        isSendingReply, isSuggestingReply,
        hasMoreEmails: !!nextPageToken, isLoadingMore,
        connect, disconnect, loadEmails, loadMore,
        sendReply, suggestReply,
    };
}
