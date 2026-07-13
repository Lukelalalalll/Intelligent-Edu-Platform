import type { FormEvent } from 'react';
import { useCallback, useState } from 'react';

import toast from 'react-hot-toast';
import type { NavigateFunction } from 'react-router-dom';

import client from '@/shared/api/client';
import type { User } from '@/shared/store/useAuthStore';

import type { ProfileFormData, ProfileTranslator } from '../components/profile/types';
import {
    buildProfileUpdatePayload,
    resolveApiErrorMessage,
    shouldReauthenticateAfterProfileSave,
} from '../utils/profileHelpers';

interface UseProfileFormStateArgs {
    user: User | null;
    updateProfile: (updates: Partial<User>) => void;
    logout: () => void;
    navigate: NavigateFunction;
    t: ProfileTranslator;
}

export function useProfileFormState({ user, updateProfile, logout, navigate, t }: UseProfileFormStateArgs) {
    const [formData, setFormData] = useState<ProfileFormData>({
        username: user?.username || '',
        email: user?.email || '',
        currentPassword: '',
        password: '',
    });
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const setFormField = useCallback(<K extends keyof ProfileFormData>(field: K, value: ProfileFormData[K]) => {
        setFormData((current) => ({ ...current, [field]: value }));
    }, []);

    const handleFormSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setShowModal(true);
    }, []);

    const handleSaveProfile = useCallback(async () => {
        setShowModal(false);
        setIsLoading(true);

        try {
            await client.post('/profile/update', buildProfileUpdatePayload(formData));

            updateProfile({ username: formData.username, email: formData.email });
            toast.success(t('profile.updated'));

            if (shouldReauthenticateAfterProfileSave(formData.password)) {
                await client.post('/logout').catch(() => undefined);
                logout();
                setTimeout(() => navigate('/login'), 600);
                return;
            }

            setFormData((current) => ({
                ...current,
                currentPassword: '',
                password: '',
            }));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t('profile.updateFailed')));
        } finally {
            setIsLoading(false);
        }
    }, [formData, logout, navigate, t, updateProfile]);

    return {
        formData,
        showCurrentPassword,
        showPassword,
        showModal,
        isLoading,
        setFormField,
        setShowModal,
        setShowCurrentPassword,
        setShowPassword,
        handleFormSubmit,
        handleSaveProfile,
    };
}
