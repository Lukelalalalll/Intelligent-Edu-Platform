import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../api';
import { useCurrentUser } from './useCurrentUser';
import { networkBus } from '@/shared/hooks/useNetworkStatus';
import type { ChatMessage } from '../types';

export function useChatRoom(roomId: string) {
    const {
        rooms, messages, setMessages, prependMessages, appendMessage,
        updateRoomLastMessage, clearUnread, markMessageFailed, replaceOptimisticMessage, wsSend,
        recordLastSeen, setActiveRoom,
    } = useChatStore();
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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesTopRef = useRef<HTMLDivElement>(null);
    const messagesAreaRef = useRef<HTMLDivElement>(null);

    const room = rooms.find((r) => r.id === roomId);
    const roomMessages = messages[roomId] || [];

    useEffect(() => {
        initialLoadingRef.current = initialLoading;
    }, [initialLoading]);

    const currentUser = useCurrentUser();
    const userId = currentUser?.id || '';

    // Check if user is scrolled near the bottom
    const isNearBottom = useCallback(() => {
        const area = messagesAreaRef.current;
        if (!area) return true;
        return area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    }, []);

    // Load messages on room change
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
                // Keep a blocking loading state while offline so users can't act on incomplete room data.
                if (networkBus.isOffline) {
                    setInitialLoading(true);
                    return;
                }
                // For non-network errors, avoid permanently blocking the room.
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
    }, [roomId, setMessages, clearUnread, setActiveRoom, navigate]);

    // 自动滚动到底部已被移除
    useEffect(() => {
        const lastMsg = roomMessages[roomMessages.length - 1];
        if (!lastMsg) return;
        
        // 只有非自己的消息，且不在底部时，才显示新消息横幅
        if (lastMsg.senderId !== userId && !isNearBottom()) {
            setHasNewMessage(true);
        } else {
            setHasNewMessage(false);
        }
    }, [roomMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll-to-bottom handler (for the "new message" banner button)
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setHasNewMessage(false);
    }, []);

    // Clear banner when user scrolls to bottom manually
    useEffect(() => {
        const area = messagesAreaRef.current;
        if (!area) return;
        const handleScroll = () => {
            if (isNearBottom()) setHasNewMessage(false);
        };
        area.addEventListener('scroll', handleScroll, { passive: true });
        return () => area.removeEventListener('scroll', handleScroll);
    }, [isNearBottom]);

    // Typing indicator timeout
    useEffect(() => {
        if (!typingUser) return;
        const t = setTimeout(() => setTypingUser(null), 3000);
        return () => clearTimeout(t);
    }, [typingUser]);

    // WS typing events
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

    // Load more (with scroll position preservation)
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
            // Preserve scroll position after prepending
            requestAnimationFrame(() => {
                if (area) {
                    area.scrollTop = area.scrollHeight - prevHeight;
                }
            });
        } catch { /* ignore */ }
        finally { setLoadingMore(false); }
    }, [loadingMore, hasMore, roomMessages, roomId, prependMessages]);

    // Intersection observer for load-more trigger
    useEffect(() => {
        const node = messagesTopRef.current;
        if (!node) return;
        const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { threshold: 0.1 });
        obs.observe(node);
        return () => obs.disconnect();
    }, [loadMore]);

    // Reset multi-select when room changes
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
        } catch { /* ignore */ }
        finally { setBatchDeleting(false); }
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

            // Refuse to send while offline
            if (networkBus.isOffline) {
                markMessageFailed(roomId, optimisticMsg.id);
                return;
            }

            // Use store-based wsSend instead of window global
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

    // Retry a failed message
    const handleRetry = useCallback(async (failedMsg: ChatMessage) => {
        // Remove the failed message first
        const store = useChatStore.getState();
        const filtered = (store.messages[roomId] || []).filter(m => m.id !== failedMsg.id);
        store.setMessages(roomId, filtered);
        // Re-send
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
        messagesEndRef, messagesTopRef, messagesAreaRef,
        handleToggleSelect, handleEnterMultiSelect, handleExitMultiSelect,
        handleBatchDelete, handleQuote, handleClearQuote,
        handleSend, handleRetry, handleTyping, scrollToBottom,
        setShowForwardModal,
    };
}
