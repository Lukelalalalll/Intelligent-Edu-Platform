// frontend/src/features/chat/hooks/useChatWebSocket.ts

import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '@/shared/store/useAuthStore';
import type { ChatMessage } from '../types';

const WS_BASE = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009')
    .replace(/^http/, 'ws');

export function useChatWebSocket(enabled = true) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCount = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const {
        setWsStatus,
        setWsSend,
        appendMessage,
        replaceOptimisticMessage,
        updateRoomLastMessage,
        incrementUnread,
        setPendingRequests,
        recallMessage,
        setRooms,
        setUnreadCounts,
    } = useChatStore();

    useEffect(() => {
        if (!enabled) {
            setWsStatus('closed');
            setWsSend(null);
            return;
        }

        const currentUser = (() => {
            const u = useAuthStore.getState().user;
            return u ?? null;
        })();

        if (!currentUser) return;

        // Helper to read current user id dynamically (avoids stale closure)
        const getCurrentUserId = (): string => {
            const u = useAuthStore.getState().user;
            return u?.id ? String(u.id) : '';
        };

        const connect = () => {
            setWsStatus('connecting');
            const ws = new WebSocket(`${WS_BASE}/api/chat/ws`);
            wsRef.current = ws;

            ws.onopen = () => {
                setWsStatus('open');

                // Expose a send function via the store (replaces window.__chatWs)
                setWsSend((data: unknown) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(data));
                    }
                });

                // On reconnect, re-fetch rooms + unread counts + active messages to catch up
                if (reconnectCount.current > 0) {
                    import('../api').then(({ chatApi }) => {
                        chatApi.getRooms().then((r) => {
                            setRooms(r.rooms);
                            const counts: Record<string, number> = {};
                            for (const room of r.rooms) counts[room.id] = (room as any).unreadCount ?? 0;
                            setUnreadCounts(counts);
                        });
                        const activeId = useChatStore.getState().activeRoomId;
                        if (activeId) {
                            chatApi.getMessages(activeId).then((r) => {
                                useChatStore.getState().setMessages(activeId, r.messages);
                            });
                        }
                    });
                }
                reconnectCount.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const type = data.type;

                    if (type === 'new_message') {
                        const msg: ChatMessage = data.message;
                        appendMessage(msg.roomId, msg);
                        updateRoomLastMessage(msg.roomId, {
                            content: msg.content,
                            senderId: msg.senderId,
                            sentAt: msg.sentAt,
                        });

                        // Increment unread for messages not currently visible in the open chat room.
                        const store = useChatStore.getState();
                        const isChatRoute = window.location.pathname.startsWith('/chat');
                        const isViewingRoom = isChatRoute && store.activeRoomId === msg.roomId;
                        const myId = getCurrentUserId();
                        console.log('[WS new_message] roomId:', msg.roomId, 'senderId:', msg.senderId, 'myId:', myId, 'isViewingRoom:', isViewingRoom);
                        if (!isViewingRoom && msg.senderId !== myId) {
                            console.log('[WS new_message] → incrementUnread for room', msg.roomId);
                            incrementUnread(msg.roomId);
                        }
                    } else if (type === 'message_ack') {
                        const msg: ChatMessage = data.message;
                        const localId: string = data.localId || '';
                        if (localId) {
                            replaceOptimisticMessage(msg.roomId, localId, msg);
                        }
                    } else if (type === 'message_recalled') {
                        const { roomId, messageId } = data as { roomId: string; messageId: string };
                        recallMessage(roomId, messageId);
                    } else if (type === 'room_created') {
                        // Refresh room list + unread counts
                        import('../api').then(({ chatApi }) => {
                            chatApi.getRooms().then((r) => {
                                setRooms(r.rooms);
                                const counts: Record<string, number> = {};
                                for (const room of r.rooms) counts[room.id] = (room as any).unreadCount ?? 0;
                                setUnreadCounts(counts);
                            });
                        });
                    } else if (type === 'room_updated') {
                        // Refresh room list + unread counts + notify GroupInfoPanel
                        import('../api').then(({ chatApi }) => {
                            chatApi.getRooms().then((r) => {
                                setRooms(r.rooms);
                                const counts: Record<string, number> = {};
                                for (const room of r.rooms) counts[room.id] = (room as any).unreadCount ?? 0;
                                setUnreadCounts(counts);
                            });
                        });
                        window.dispatchEvent(
                            new CustomEvent('chat_room_updated', { detail: data }),
                        );
                    } else if (type === 'room_deleted' || type === 'kicked_from_room') {
                        // Refresh room list + unread counts + if current room, navigate away
                        import('../api').then(({ chatApi }) => {
                            chatApi.getRooms().then((r) => {
                                setRooms(r.rooms);
                                const counts: Record<string, number> = {};
                                for (const room of r.rooms) counts[room.id] = (room as any).unreadCount ?? 0;
                                setUnreadCounts(counts);
                            });
                        });
                        const store = useChatStore.getState();
                        const kickedRoomId = data.roomId as string;
                        if (store.activeRoomId === kickedRoomId) {
                            store.setActiveRoom(null);
                        }
                    } else if (type === 'typing') {
                        window.dispatchEvent(
                            new CustomEvent('chat_typing', { detail: data }),
                        );
                    } else if (type === 'friend_request' || type === 'friend_accepted') {
                        // Refresh friend requests
                        import('../api').then(({ chatApi }) => {
                            chatApi.getFriendRequests().then((r) =>
                                setPendingRequests(r.requests),
                            );
                            if (type === 'friend_accepted') {
                                chatApi.getContacts().then((r) =>
                                    useChatStore.getState().setContacts(r.contacts),
                                );
                            }
                        });
                    }
                } catch {
                    // ignore malformed messages
                }
            };

            ws.onclose = () => {
                setWsStatus('closed');
                setWsSend(null);
                wsRef.current = null;

                // Auto-reconnect with exponential backoff (no retry limit)
                const delay = Math.min(1000 * 2 ** reconnectCount.current, 30000);
                reconnectCount.current++;
                reconnectTimer.current = setTimeout(connect, delay);
            };

            ws.onerror = () => {
                // onclose will fire after this
            };
        };

        connect();

        // Visibility API: force reconnect when tab comes back to foreground
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const ws = wsRef.current;
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    // Clear any pending reconnect and try immediately
                    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
                    reconnectTimer.current = null;
                    connect();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setWsSend(null);
        };
    }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
