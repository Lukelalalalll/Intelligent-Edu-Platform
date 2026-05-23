import { create } from 'zustand';

export interface User {
    id: string;
    username: string;
    email: string;
    role: 'admin' | 'teacher' | 'student';
    [key: string]: any;
}

interface AuthState {
    user: User | null;
    login: (userData: User) => void;
    logout: () => void;
    updateProfile: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,

    login: (userData) => {
        set({ user: userData });
    },

    logout: () => {
        set({ user: null });
    },

    updateProfile: (updates) =>
        set((state) => {
            if (!state.user) return state;
            return { user: { ...state.user, ...updates } };
        }),
}));
