import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../api';
import { useCurrentUser } from './useCurrentUser';
import { networkBus } from '@/shared/hooks/useNetworkStatus';
import type { ChatMessage } from '../types';

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useChatRoom(roomId: string) {
    const room = useChatStore((state) => state.rooms.find((r) => r.id === roomId));
    const roomMessages = useChatStore((state) => state.messages[roomId] ?? EMPTY_MESSAGES);
    const setMessages = useChatStore((state) => state.setMessages);
    const prependMessages = useChatStore((state) => state.prependMessages);
    const appendMessage = useChatStore((state) => state.appendMessage);
    const updateRoomLastMessage = useChatStore((state) => state.updateRoomLastMessage);
    const clearUnread = useChatStore((state) => state.clearUnread);
    const markMessageFailed = useChatStore((state) => state.markMessageFailed);
    const replaceOptimisticMessage = useChatStore((state) => state.replaceOptimisticMessage);
    const wsSend = useChatStore((state) => state.wsSend);
    const recordLastSeen = useChatStore((state) => state.recordLastSeen);
    const setActiveRoom = useChatStore((state) => state.setActiveRoom);
    const navigate = useNavigate();

    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [typingUser, setTypingUser] = useState<string | null>(null);
    const [multiSelect, setMultiSelect] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [batchDeleting, setBatchDeleting] = useState(false);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const initialLoadingRef = useRef(true);

    const messagesAreaRef = useRef<HTMLDivElement>(null);

    const lastMessage = roomMessages[roomMessages.length - 1] ?? null;

    useEffect(() => {
        initialLoadingRef.current = initialLoading;
    }, [initialLoading]);

    const currentUser = useCurrentUser();
    const userId = currentUser?.id || '';

    const isNearBottom = useCallback(() => {
        const area = messagesAreaRef.current;
        if (!area) return true;
        return area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    }, []);

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore || roomMessages.length === 0) return;
        const area = messagesAreaRef.current;
        const prevHeight = area?.scrollHeight ?? 0;
        setLoadingMore(true);
        try {
            const oldest = roomMessages[0]?.sentAt;
            const res = await chatApi.getMessages(roomId, oldest);
            prependMessages(roomId, res.messages);
            setHasMore(res.hasMore);
            requestAnimationFrame(() => {
                if (area) {
                    area.scrollTop = area.scrollHeight - prevHeight;
                }
            });
        } catch {
            // ignore
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, roomMessages, roomId, prependMessages]);

    useEffect(() => {
        let alive = true;

        const loadMessages = async () => {
            try {
                const res = await chatApi.getMessages(roomId);
                if (!alive) return;
                setMessages(roomId, res.messages);
                setHasMore(res.hasMore);
                setInitialLoading(false);
            } catch (err: any) {
                if (!alive) return;
                const status = err?.response?.status;
                if (status === 404 || status === 403) {
                    setMessages(roomId, []);
                    setActiveRoom(null);
                    navigate('/chat', { replace: true });
                    setInitialLoading(false);
                    return;
                }
                if (networkBus.isOffline) {
                    setInitialLoading(true);
                    return;
                }
                setInitialLoading(false);
            }
        };

        setInitialLoading(true);
        loadMessages();

        const unsubscribe = networkBus.subscribe((offline) => {
            if (!alive) return;
            if (!offline && initialLoadingRef.current) {
                loadMessages();
            }
        });

        recordLastSeen(roomId);
        clearUnread(roomId);
        chatApi.markRead(roomId).catch(() => {});
        setHasNewMessage(false);
        return () => {
            alive = false;
            unsubscribe();
        };
    }, [roomId, setMessages, clearUnread, setActiveRoom, navigate, recordLastSeen]);

    useEffect(() => {
        if (!lastMessage) return;

        if (lastMessage.senderId !== userId && !isNearBottom()) {
            setHasNewMessage(true);
        } else {
            setHasNewMessage(false);
        }
    }, [lastMessage, userId, isNearBottom]);

    const scrollToBottom = useCallback(() => {
        const area = messagesAreaRef.current;
        if (!area) return;
        area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
        setHasNewMessage(false);
    }, []);

    useEffect(() => {
        const area = messagesAreaRef.current;
        if (!area) return;

        let rafId: number | null = null;

        const handleScroll = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (isNearBottom()) {
                    setHasNewMessage(false);
                }
                if (area.scrollTop <= 48) {
                    void loadMore();
                }
            });
        };

        area.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            area.removeEventListener('scroll', handleScroll);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [isNearBottom, loadMore]);

    useEffect(() => {
        if (!typingUser) return;
        const t = setTimeout(() => setTypingUser(null), 3000);
        return () => clearTimeout(t);
    }, [typingUser]);

    useEffect(() => {
        const handler = (e: CustomEvent) => {
            const data = e.detail;
            if (data.roomId === roomId && data.userId !== userId) {
                setTypingUser(data.username || 'Someone');
            }
        };
        window.addEventListener('chat_typing' as any, handler);
        return () => window.removeEventListener('chat_typing' as any, handler);
    }, [roomId, userId]);

    useEffect(() => {
        setMultiSelect(false);
        setSelectedIds(new Set());
        setQuotedMessage(null);
    }, [roomId]);

    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const handleEnterMultiSelect = useCallback((id: string) => {
        setMultiSelect(true);
        setSelectedIds(new Set([id]));
    }, []);

    const handleExitMultiSelect = useCallback(() => {
        setMultiSelect(false);
        setSelectedIds(new Set());
    }, []);

    const handleBatchDelete = useCallback(async () => {
        if (selectedIds.size === 0) return;
        setBatchDeleting(true);
        try {
            await chatApi.batchDeleteMessages(Array.from(selectedIds));
            const store = useChatStore.getState();
            const filtered = (store.messages[roomId] || []).filter(m => !selectedIds.has(m.id));
            store.setMessages(roomId, filtered);
            handleExitMultiSelect();
        } catch {
            // ignore
        } finally {
            setBatchDeleting(false);
        }
    }, [selectedIds, roomId, handleExitMultiSelect]);

    const handleQuote = useCallback((msg: ChatMessage) => setQuotedMessage(msg), []);
    const handleClearQuote = useCallback(() => setQuotedMessage(null), []);

    const handleSend = useCallback(
        async (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number; mimeType: string; messageType: 'file' }) => {
            const now = new Date().toISOString();
            const replyTo = quotedMessage ? {
                id: quotedMessage.id,
                senderName: quotedMessage.senderName,
                content: (quotedMessage.content || '').slice(0, 120),
            } : null;
            const optimisticMsg: ChatMessage = {
                id: `optimistic-${Date.now()}`,
                roomId, senderId: userId,
                senderName: currentUser?.username || '',
                content, type: 'text' as const,
                messageType: fileData ? 'file' as const : 'text' as const,
                recalled: false, replyTo,
                ...(fileData ? { fileUrl: fileData.fileUrl, fileName: fileData.fileName, fileSize: fileData.fileSize, mimeType: fileData.mimeType } : {}),
                readBy: [userId], sentAt: now,
            };
            appendMessage(roomId, optimisticMsg);
            updateRoomLastMessage(roomId, { content, senderId: userId, sentAt: now });
            setQuotedMessage(null);

            if (networkBus.isOffline) {
                markMessageFailed(roomId, optimisticMsg.id);
                return;
            }

            if (fileData || !wsSend) {
                try {
                    const res = await chatApi.sendMessage(roomId, content, fileData, quotedMessage?.id);
                    if (res.message) {
                        replaceOptimisticMessage(roomId, optimisticMsg.id, res.message);
                    }
                } catch {
                    markMessageFailed(roomId, optimisticMsg.id);
                }
                return;
            }
            wsSend({ type: 'new_message', roomId, content, localId: optimisticMsg.id, replyTo: quotedMessage?.id || '' });
        },
        [roomId, userId, currentUser, appendMessage, updateRoomLastMessage, quotedMessage, wsSend, markMessageFailed, replaceOptimisticMessage],
    );

    const handleRetry = useCallback(async (failedMsg: ChatMessage) => {
        const store = useChatStore.getState();
        const filtered = (store.messages[roomId] || []).filter(m => m.id !== failedMsg.id);
        store.setMessages(roomId, filtered);
        const fileData = failedMsg.messageType === 'file' && failedMsg.fileUrl
            ? { fileUrl: failedMsg.fileUrl, fileName: failedMsg.fileName!, fileSize: failedMsg.fileSize!, mimeType: failedMsg.mimeType!, messageType: 'file' as const }
            : undefined;
        await handleSend(failedMsg.content, fileData);
    }, [roomId, handleSend]);

    const handleTyping = useCallback(() => {
        if (wsSend) {
            wsSend({ type: 'typing', roomId });
        }
    }, [roomId, wsSend]);

    return {
        room, roomMessages, userId, currentUser,
        hasMore, loadingMore, typingUser, hasNewMessage, initialLoading,
        multiSelect, selectedIds, quotedMessage, showForwardModal, batchDeleting,
        messagesAreaRef,
        handleToggleSelect, handleEnterMultiSelect, handleExitMultiSelect,
        handleBatchDelete, handleQuote, handleClearQuote,
        handleSend, handleRetry, handleTyping, scrollToBottom,
        setShowForwardModal,
    };
}
