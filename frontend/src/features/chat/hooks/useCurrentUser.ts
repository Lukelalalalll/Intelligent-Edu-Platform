import { useMemo } from 'react';

export interface CurrentUser {
    id: string;
    username: string;
    [key: string]: unknown;
}

export function useCurrentUser(): CurrentUser | null {
    return useMemo(() => {
        try {
            const raw = localStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }, []);
}
