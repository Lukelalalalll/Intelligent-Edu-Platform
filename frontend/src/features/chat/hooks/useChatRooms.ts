// frontend/src/features/chat/hooks/useChatRooms.ts

import { useEffect, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../api';

export function useChatRooms() {
    const { setRooms, setUnreadCounts, wsStatus } = useChatStore();

    const load = useCallback(async () => {
        try {
            const res = await chatApi.getRooms();
            setRooms(res.rooms);
            // Seed unread counts from server so they survive page refresh
            const counts: Record<string, number> = {};
            for (const room of res.rooms) {
                if ((room.unreadCount ?? 0) > 0) {
                    counts[room.id] = room.unreadCount!;
                }
            }
            setUnreadCounts(counts);
        } catch {
            // ignore
        }
    }, [setRooms, setUnreadCounts]);

    // Initial load
    useEffect(() => {
        load();
    }, [load]);

    // Poll only when WebSocket is not connected
    useEffect(() => {
        if (wsStatus === 'open') return;
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [wsStatus, load]);
}
