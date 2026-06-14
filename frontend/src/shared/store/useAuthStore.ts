import { create } from 'zustand';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';
export const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;

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
