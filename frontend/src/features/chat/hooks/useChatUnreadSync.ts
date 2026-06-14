import { useEffect } from 'react';

import { chatApi } from '../api';
import { useChatStore } from '../store/chatStore';

export function useChatUnreadSync(enabled = true) {
    const setUnreadCounts = useChatStore((s) => s.setUnreadCounts);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;

        const sync = async () => {
            if (document.visibilityState !== 'visible') return;

            try {
                const res = await chatApi.getRooms();
                if (cancelled) return;
                const counts: Record<string, number> = {};
                for (const room of res.rooms) {
                    counts[room.id] = room.unreadCount ?? 0;
                }
                setUnreadCounts(counts);
            } catch {
                // ignore sidebar badge refresh failures
            }
        };

        void sync();
        const interval = window.setInterval(() => {
            void sync();
        }, 60000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [enabled, setUnreadCounts]);
}
