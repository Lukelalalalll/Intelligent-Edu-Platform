// frontend/src/features/chat/hooks/useChatWebSocket.ts

import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import type { ChatMessage } from '../types';

const WS_BASE = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009')
    .replace(/^http/, 'ws');

export function useChatWebSocket() {
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
    } = useChatStore();

    useEffect(() => {
        const currentUser = (() => {
            try {
                const u = localStorage.getItem('user');
                return u ? JSON.parse(u) : null;
            } catch {
                return null;
            }
        })();

        if (!currentUser) return;

        // Helper to read current user id dynamically (avoids stale closure)
        const getCurrentUserId = (): string => {
            try {
                const u = localStorage.getItem('user');
                return u ? JSON.parse(u).id : '';
            } catch {
                return '';
            }
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

                // On reconnect, re-fetch rooms + active room messages to catch up
                if (reconnectCount.current > 0) {
                    import('../../../api/chatApi').then(({ chatApi }) => {
                        chatApi.getRooms().then((r) => setRooms(r.rooms));
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

                        // Increment unread if not in active room
                        const store = useChatStore.getState();
                        if (msg.roomId !== store.activeRoomId && msg.senderId !== getCurrentUserId()) {
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
                        // Refresh room list
                        import('../../../api/chatApi').then(({ chatApi }) => {
                            chatApi.getRooms().then((r) => setRooms(r.rooms));
                        });
                    } else if (type === 'typing') {
                        window.dispatchEvent(
                            new CustomEvent('chat_typing', { detail: data }),
                        );
                    } else if (type === 'friend_request' || type === 'friend_accepted') {
                        // Refresh friend requests
                        import('../../../api/chatApi').then(({ chatApi }) => {
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

                // Auto-reconnect with exponential backoff (max 5 retries)
                if (reconnectCount.current < 5) {
                    const delay = Math.min(1000 * 2 ** reconnectCount.current, 30000);
                    reconnectCount.current++;
                    reconnectTimer.current = setTimeout(connect, delay);
                }
            };

            ws.onerror = () => {
                // onclose will fire after this
            };
        };

        connect();

        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setWsSend(null);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
