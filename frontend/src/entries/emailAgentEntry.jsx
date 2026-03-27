import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import EmailAgent from '../pages/EmailAgent';

export default function EmailAgentEntry() {
    const location = useLocation();
    const navigate = useNavigate();

    const [emails, setEmails] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedEmailId, setSelectedEmailId] = useState('');
    const [selectedEmailDetail, setSelectedEmailDetail] = useState(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const [isReplying, setIsReplying] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);

    const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const loadEmails = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const res = await client.get('/gmail/list');
            const nextEmails = res?.data?.emails || [];
            setEmails(nextEmails);
            setIsConnected(true);

            if (nextEmails.length === 0) {
                setSelectedEmailId('');
                setSelectedEmailDetail(null);
                return;
            }

            setSelectedEmailId((prevId) => {
                const matched = nextEmails.find((mail) => mail.id === prevId);
                return matched ? prevId : nextEmails[0].id;
            });
        } catch (err) {
            const detail = err?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Failed to fetch emails.';
            setError(message);
            setIsConnected(false);
            setEmails([]);
            setSelectedEmailId('');
            setSelectedEmailDetail(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadEmailDetail = useCallback(async (emailId) => {
        if (!emailId) {
            setSelectedEmailDetail(null);
            return;
        }

        setIsDetailLoading(true);
        try {
            const res = await client.get(`/gmail/message/${emailId}`);
            setSelectedEmailDetail(res?.data?.email || null);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Failed to fetch email detail.';
            setError(message);
            setSelectedEmailDetail(null);
        } finally {
            setIsDetailLoading(false);
        }
    }, []);

    const handleConnect = useCallback(async () => {
        setIsConnecting(true);
        setError('');
        try {
            const res = await client.get('/gmail/auth_url');
            const authUrl = res?.data?.auth_url;
            if (!authUrl) {
                throw new Error('Missing auth url from server');
            }
            window.location.href = authUrl;
        } catch (err) {
            const detail = err?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Failed to start Gmail OAuth.';
            setError(message);
            setIsConnecting(false);
        }
    }, []);

    const handleSendReply = useCallback(async () => {
        if (!selectedEmailId || !replyBody.trim()) return;
        setIsSendingReply(true);
        setError('');
        try {
            await client.post(`/gmail/message/${selectedEmailId}/reply`, {
                body: replyBody
            });
            setIsReplying(false);
            setReplyBody('');
            // Optionally refresh email or show success notification
        } catch (err) {
            const detail = err?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Failed to send reply.';
            setError(message);
        } finally {
            setIsSendingReply(false);
        }
    }, [selectedEmailId, replyBody]);

    useEffect(() => {
        const code = query.get('code');
        const state = query.get('state');

        if (!code) {
            loadEmails();
            return;
        }

        const handleCallback = async () => {
            setIsLoading(true);
            setError('');
            try {
                await client.post('/gmail/callback', { code, state });
                await loadEmails();
                navigate('/email-agent', { replace: true });
            } catch (err) {
                const detail = err?.response?.data?.detail;
                const message = typeof detail === 'string' ? detail : 'Failed to complete Gmail OAuth callback.';
                setError(message);
            } finally {
                setIsLoading(false);
                setIsConnecting(false);
            }
        };

        handleCallback();
    }, [query, loadEmails, navigate]);

    useEffect(() => {
        if (!selectedEmailId) {
            setSelectedEmailDetail(null);
            setIsReplying(false);
            setReplyBody('');
            return;
        }
        setIsReplying(false);
        setReplyBody('');
        loadEmailDetail(selectedEmailId);
    }, [selectedEmailId, loadEmailDetail]);

    return (
        <EmailAgent
            onConnect={handleConnect}
            onRefresh={loadEmails}
            onSelectEmail={setSelectedEmailId}
            onSendReply={handleSendReply}
            isReplying={isReplying}
            setIsReplying={setIsReplying}
            replyBody={replyBody}
            setReplyBody={setReplyBody}
            isSendingReply={isSendingReply}
            emails={emails}
            isLoading={isLoading}
            isDetailLoading={isDetailLoading}
            isConnecting={isConnecting}
            isConnected={isConnected}
            selectedEmailId={selectedEmailId}
            selectedEmailDetail={selectedEmailDetail}
            error={error}
        />
    );
}
