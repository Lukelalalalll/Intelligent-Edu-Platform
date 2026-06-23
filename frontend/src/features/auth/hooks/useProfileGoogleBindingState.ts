import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import toast from 'react-hot-toast';

import client from '@/shared/api/client';
import type { User } from '@/shared/store/useAuthStore';

import type { GoogleBindingState, ProfileTranslator } from '../components/profile/types';
import { resolveApiErrorMessage } from '../utils/profileHelpers';

interface UseProfileGoogleBindingStateArgs {
    user: User | null;
    updateProfile: (updates: Partial<User>) => void;
    t: ProfileTranslator;
}

interface GoogleBindingResponse {
    linked?: boolean;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    linkedAt?: string | null;
    canUnlink?: boolean;
}

interface GoogleBindingMutationResponse {
    user?: Partial<User>;
    google?: GoogleBindingResponse;
}

function buildFallbackGoogleBinding(user: User | null): GoogleBindingState {
    return {
        linked: Boolean(user?.googleLinked),
        email: null,
        name: null,
        avatarUrl: user?.avatarUrl ?? null,
        linkedAt: null,
        canUnlink: Boolean(user?.googleLinked),
    };
}

function normalizeGoogleBinding(
    payload: GoogleBindingResponse | undefined,
    fallbackUser: User | null,
): GoogleBindingState {
    const fallback = buildFallbackGoogleBinding(fallbackUser);
    return {
        linked: Boolean(payload?.linked ?? fallback.linked),
        email: payload?.email ?? null,
        name: payload?.name ?? null,
        avatarUrl: payload && 'avatarUrl' in payload ? (payload.avatarUrl ?? null) : fallback.avatarUrl,
        linkedAt: payload?.linkedAt ?? null,
        canUnlink: Boolean(payload?.canUnlink ?? (payload?.linked ?? fallback.linked)),
    };
}

export function useProfileGoogleBindingState({ user, updateProfile, t }: UseProfileGoogleBindingStateArgs) {
    const userRef = useRef(user);
    userRef.current = user;
    const fallbackState = useMemo(
        () => buildFallbackGoogleBinding(user),
        [user?.id, user?.googleLinked, user?.avatarUrl],
    );
    const [googleBinding, setGoogleBinding] = useState<GoogleBindingState>(fallbackState);
    const [bindingLoading, setBindingLoading] = useState(true);
    const [linkingBusy, setLinkingBusy] = useState(false);
    const [unlinkingBusy, setUnlinkingBusy] = useState(false);

    useEffect(() => {
        setGoogleBinding((current) => ({
            ...current,
            linked: fallbackState.linked,
            avatarUrl: current.avatarUrl ?? fallbackState.avatarUrl,
            canUnlink: fallbackState.linked ? current.canUnlink : false,
        }));
    }, [fallbackState]);

    const applyMutationResult = useCallback(
        (response: GoogleBindingMutationResponse) => {
            const nextState = normalizeGoogleBinding(response.google, userRef.current);
            setGoogleBinding(nextState);
            updateProfile({
                ...(response.user || {}),
                googleLinked: nextState.linked,
                avatarUrl: nextState.avatarUrl,
            });
        },
        [updateProfile],
    );

    const loadGoogleBinding = useCallback(
        async (isMounted?: () => boolean) => {
            try {
                setBindingLoading(true);
                const response = await client.get<GoogleBindingResponse>('/profile/connections/google');
                if (isMounted && !isMounted()) {
                    return;
                }
                setGoogleBinding(normalizeGoogleBinding(response.data, userRef.current));
            } catch {
                if (!isMounted || isMounted()) {
                    setGoogleBinding(buildFallbackGoogleBinding(userRef.current));
                }
            } finally {
                if (!isMounted || isMounted()) {
                    setBindingLoading(false);
                }
            }
        },
        [user?.id],
    );

    useEffect(() => {
        let isMounted = true;
        void loadGoogleBinding(() => isMounted);
        return () => {
            isMounted = false;
        };
    }, [loadGoogleBinding]);

    const handleBindGoogleCredential = useCallback(async (credential: string) => {
        setLinkingBusy(true);
        try {
            const response = await client.post<GoogleBindingMutationResponse>('/profile/connections/google/link', {
                credential,
            });
            applyMutationResult(response.data);
            toast.success(t('profile.googleLinkedSuccess'));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.googleLinkFailed')));
        } finally {
            setLinkingBusy(false);
        }
    }, [applyMutationResult, t]);

    const handleUnlinkGoogle = useCallback(async () => {
        setUnlinkingBusy(true);
        try {
            const response = await client.delete<GoogleBindingMutationResponse>('/profile/connections/google');
            applyMutationResult(response.data);
            toast.success(t('profile.googleUnlinkedSuccess'));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.googleUnlinkFailed')));
        } finally {
            setUnlinkingBusy(false);
        }
    }, [applyMutationResult, t]);

    return {
        googleBinding,
        bindingLoading,
        linkingBusy,
        unlinkingBusy,
        handleBindGoogleCredential,
        handleUnlinkGoogle,
    };
}
