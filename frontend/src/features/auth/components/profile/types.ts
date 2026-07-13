import type { TranslationKey } from '@/shared/i18n';

export type ProfileTranslator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export interface ProfileFormData {
    username: string;
    email: string;
    currentPassword: string;
    password: string;
}

export interface ProfileCourseItem {
    courseId?: string;
    id?: string;
    name: string;
    degreeLevel?: string | null;
    semester?: string | null;
}

export interface AuthSessionItem {
    sessionId: string;
    createdAt: string | null;
    lastSeenAt: string | null;
    lastRotatedAt: string | null;
    expiresAt: string | null;
    current: boolean;
    amr: string[];
    deviceLabel?: string;
    browser?: string;
    os?: string;
    deviceType?: string;
    ipLabel?: string;
}

export interface SecurityState {
    mfa: {
        enabled: boolean;
        totpConfigured: boolean;
        backupCodesRemaining: number;
        preferredMethod: string;
    enrolledAt: string | null;
    };
    enrollmentPending: {
        active: boolean;
        startedAt: string | null;
    };
}

export interface GoogleBindingState {
    linked: boolean;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    linkedAt: string | null;
    canUnlink: boolean;
}

export interface RoleInfo {
    icon: string;
    text: string;
}

export interface CourseSectionCopy {
    title: string;
    subtitle: string;
}
