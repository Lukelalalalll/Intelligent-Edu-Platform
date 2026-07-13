import { useMemo } from 'react';
import { useAuthStore } from '@/shared/store/useAuthStore';

export interface CurrentUser {
    id: string;
    username: string;
    [key: string]: unknown;
}

export function useCurrentUser(): CurrentUser | null {
    const storeUser = useAuthStore((s) => s.user);
    return useMemo(() => {
        if (!storeUser) return null;
        return {
            ...storeUser,
            id: String(storeUser.id ?? ''),
            username: storeUser.username,
        } as CurrentUser;
    }, [storeUser]);
}
