// frontend/src/features/chat/hooks/useChatRooms.ts

import { useEffect, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../api';

export function useChatRooms(enabled = true) {
    const { setRooms, setUnreadCounts, wsStatus } = useChatStore();

    const load = useCallback(async () => {
        try {
            const res = await chatApi.getRooms();
            setRooms(res.rooms);
            // Seed unread counts from server so they survive page refresh
            const counts: Record<string, number> = {};
            for (const room of res.rooms) {
                counts[room.id] = room.unreadCount ?? 0;
            }
            console.log('[useChatRooms] loaded rooms, unread counts from server:', counts);
            setUnreadCounts(counts);
        } catch (err) {
            console.error('[useChatRooms] load failed:', err);
        }
    }, [setRooms, setUnreadCounts]);

    // Initial load
    useEffect(() => {
        if (!enabled) return;
        load();
    }, [enabled, load]);

    // Poll only when WebSocket is not connected
    useEffect(() => {
        if (!enabled) return;
        if (wsStatus === 'open') return;
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [enabled, wsStatus, load]);
}
