import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { EmailSummary, EmailDetail, EmailClassification } from '@/types/api';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '@/shared/aiProvider';
import { gmailApi } from '../../api/emailApi';
import { extractError } from './components/helpers';
import { useEmailActions } from './components/useEmailActions';
import { useOAuthCallbackEffect } from './components/useOAuthCallback';
import { useSelectionEffect } from './components/useSelectionEffect';

export function useEmailClient() {
    const location = useLocation();
    const navigate = useNavigate();
    const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const [activeProvider, setActiveProvider] = useState<string>('select');
    const [emails, setEmails] = useState<EmailSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedEmailId, setSelectedEmailId] = useState('');
    const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailDetail | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [emailClassification, setEmailClassification] = useState<EmailClassification | null>(null);
    const [isClassifying, setIsClassifying] = useState(false);
    const [classifyFailed, setClassifyFailed] = useState(false);

    const [isReplying, setIsReplying] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [isSuggestingReply, setIsSuggestingReply] = useState(false);
    const [aiProvider, setAiProvider] = useState<AIProvider>(() => getStoredAIProvider());

    const [nextPageToken, setNextPageToken] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const showSuccess = useCallback((msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 3000);
    }, []);

    useEffect(() => {
        setStoredAIProvider(aiProvider);
    }, [aiProvider]);

    const resetSelection = useCallback(() => {
        setSelectedEmailId('');
        setSelectedEmailDetail(null);
        setEmailClassification(null);
    }, []);

    const {
        loadEmails,
        loadMore,
        loadEmailDetail,
        connect,
        disconnect,
        sendReply,
        suggestReply,
    } = useEmailActions({
        selectedProvider: activeProvider,
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
    });

    useOAuthCallbackEffect({
        code: query.get('code'),
        state: query.get('state'),
        setActiveProvider,
        setIsLoading,
        setError,
        setIsConnecting,
        gmailCallback: gmailApi.callback,
        loadEmails,
        navigate,
        extractError,
    });

    useSelectionEffect({
        selectedEmailId,
        setSelectedEmailDetail,
        setEmailClassification,
        setIsReplying,
        setReplyBody,
        loadEmailDetail,
    });

    const selectProvider = useCallback((id: string) => {
        setActiveProvider(id);
        if (id === 'gmail') {
            void loadEmails();
        }
    }, [loadEmails]);

    const backToSelect = useCallback(() => setActiveProvider('select'), []);

    return {
        activeProvider,
        selectProvider,
        backToSelect,
        emails,
        isLoading,
        isConnecting,
        isConnected,
        selectedEmailId,
        setSelectedEmailId,
        selectedEmailDetail,
        isDetailLoading,
        emailClassification,
        isClassifying,
        classifyFailed,
        error,
        setError,
        successMessage,
        isReplying,
        setIsReplying,
        replyBody,
        setReplyBody,
        isSendingReply,
        isSuggestingReply,
        aiProvider,
        setAiProvider,
        hasMoreEmails: !!nextPageToken,
        isLoadingMore,
        connect,
        disconnect,
        loadEmails,
        loadMore,
        sendReply,
        suggestReply,
    };
}
