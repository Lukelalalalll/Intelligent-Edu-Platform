// frontend/src/features/chat/hooks/useChatWebSocket.ts

import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '@/shared/store/useAuthStore';
import type { ChatMessage } from '../types';
import { resolveWsRoot } from '@/shared/api/root';

const WS_BASE = resolveWsRoot();

export function useChatWebSocket(enabled = true) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCount = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let disposed = false;

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
            setContacts,
        } = useChatStore.getState();

        const refreshRoomsAndUnread = () => {
            if (disposed) return;
            import('../api/wsSyncApi').then(({ fetchRoomsAndUnreadCounts }) => {
                if (disposed) return;
                fetchRoomsAndUnreadCounts().then(({ rooms, counts }) => {
                    if (disposed) return;
                    setRooms(rooms);
                    setUnreadCounts(counts);
                }).catch(() => {});
            }).catch(() => {});
        };

        const refreshActiveMessages = () => {
            if (disposed) return;
            const activeId = useChatStore.getState().activeRoomId;
            if (!activeId) return;
            import('../api/wsSyncApi').then(({ fetchRoomMessages }) => {
                if (disposed) return;
                fetchRoomMessages(activeId).then((response) => {
                    if (disposed) return;
                    useChatStore.getState().setMessages(activeId, response.messages);
                }).catch(() => {});
            }).catch(() => {});
        };

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
            if (disposed) return;

            setWsStatus('connecting');
            const ws = new WebSocket(`${WS_BASE}/api/chat/ws`);
            wsRef.current = ws;

            ws.onopen = () => {
                if (disposed) {
                    ws.close();
                    return;
                }

                setWsStatus('open');

                // Expose a send function via the store (replaces window.__chatWs)
                setWsSend((data: unknown) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(data));
                    }
                });

                // On reconnect, re-fetch rooms + unread counts + active messages to catch up
                if (reconnectCount.current > 0) {
                    refreshRoomsAndUnread();
                    refreshActiveMessages();
                }
                reconnectCount.current = 0;
            };

            ws.onmessage = (event) => {
                if (disposed) return;

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
                        if (!isViewingRoom && msg.senderId !== myId) {
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
                        refreshRoomsAndUnread();
                    } else if (type === 'room_updated') {
                        // Refresh room list + unread counts + notify GroupInfoPanel
                        refreshRoomsAndUnread();
                        window.dispatchEvent(
                            new CustomEvent('chat_room_updated', { detail: data }),
                        );
                    } else if (type === 'room_deleted' || type === 'kicked_from_room') {
                        // Refresh room list + unread counts + if current room, navigate away
                        refreshRoomsAndUnread();
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
                        import('../api/wsSyncApi').then(({ fetchFriendRequests, fetchContacts }) => {
                            if (disposed) return;
                            fetchFriendRequests().then((r) => {
                                if (!disposed) setPendingRequests(r.requests);
                            }).catch(() => {});
                            if (type === 'friend_accepted') {
                                fetchContacts().then((r) => {
                                    if (!disposed) setContacts(r.contacts);
                                }).catch(() => {});
                            }
                        }).catch(() => {});
                    }
                } catch {
                    // ignore malformed messages
                }
            };

            ws.onclose = () => {
                if (wsRef.current === ws) {
                    wsRef.current = null;
                }
                if (disposed) return;

                setWsStatus('closed');
                setWsSend(null);

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
            if (disposed) return;

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
            disposed = true;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                const ws = wsRef.current;
                wsRef.current = null;
                ws.close();
            }
            setWsStatus('closed');
            setWsSend(null);
        };
    }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
