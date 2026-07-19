import { create } from 'zustand';

/** Auth state before and after the browser session has been checked. */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/** Maximum age of a validated browser session before it is refreshed. */
export const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;

/** Authenticated user shape consumed by route guards and shared navigation. */
export interface User {
    id: string;
    username: string;
    email: string;
    role: 'admin' | 'teacher' | 'student';
    teacherCourseIds?: string[];
    avatarUrl?: string | null;
    googleLinked?: boolean;
    [key: string]: any;
}

/** Global auth store contract used by guards, API interceptors, and profile flows. */
interface AuthState {
    user: User | null;
    status: AuthStatus;
    isSessionLoading: boolean;
    lastValidatedAt: number;
    login: (userData: User, options?: { validatedAt?: number }) => void;
    logout: () => void;
    updateProfile: (updates: Partial<User>) => void;
    beginSessionCheck: () => void;
    completeSessionCheck: (userData: User | null, options?: { validatedAt?: number }) => void;
}

/** Centralized browser auth state for session bootstrap and route protection. */
export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    status: 'unknown',
    isSessionLoading: false,
    lastValidatedAt: 0,

    login: (userData, options) => {
        set({
            user: userData,
            status: 'authenticated',
            isSessionLoading: false,
            lastValidatedAt: options?.validatedAt ?? Date.now(),
        });
    },

    logout: () => {
        set({
            user: null,
            status: 'anonymous',
            isSessionLoading: false,
            lastValidatedAt: Date.now(),
        });
    },

    updateProfile: (updates) =>
        set((state) => {
            if (!state.user) return state;
            return { user: { ...state.user, ...updates } };
        }),

    beginSessionCheck: () => {
        set({ isSessionLoading: true });
    },

    completeSessionCheck: (userData, options) => {
        set({
            user: userData,
            status: userData ? 'authenticated' : 'anonymous',
            isSessionLoading: false,
            lastValidatedAt: options?.validatedAt ?? Date.now(),
        });
    },
}));
