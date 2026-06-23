import type {
    AuthSessionItem,
    CourseSectionCopy,
    ProfileFormData,
    ProfileTranslator,
    RoleInfo,
} from '../components/profile/types';

export function getRoleInfo(role: string | undefined, t: ProfileTranslator): RoleInfo {
    switch (role) {
        case 'admin':
            return { icon: 'fa-shield-alt', text: t('profile.role.admin') };
        case 'teacher':
            return { icon: 'fa-chalkboard-teacher', text: t('profile.role.teacher') };
        default:
            return { icon: 'fa-user-graduate', text: t('profile.role.student') };
    }
}

export function buildCourseSectionCopy(
    role: string | undefined,
    courseSemester: string,
    t: ProfileTranslator,
): CourseSectionCopy {
    const isTeacher = role === 'teacher';

    return {
        title: isTeacher ? t('profile.teachingCourses') : t('profile.enrolledCourses'),
        subtitle: isTeacher
            ? t('profile.currentSemester', { semester: courseSemester || t('profile.notAvailable') })
            : t('profile.linkedCourses'),
    };
}

export function parseHistoryTtlInput(ttlInput: string, ttlPermanent: boolean) {
    const days = ttlPermanent ? 0 : parseInt(ttlInput, 10);

    return {
        days,
        isValid: ttlPermanent || (!Number.isNaN(days) && days >= 1),
    };
}

export function buildProfileUpdatePayload(formData: ProfileFormData) {
    return {
        username: formData.username.trim(),
        email: formData.email.trim(),
        current_password: formData.currentPassword,
        password: formData.password.trim(),
    };
}

export function shouldReauthenticateAfterProfileSave(password: string) {
    return Boolean(password.trim());
}

export function resolveApiErrorMessage(error: unknown, fallback: string) {
    const responseData = (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;

    return responseData?.detail || responseData?.message || fallback;
}

export function formatSessionTime(value: string | null, t: ProfileTranslator) {
    if (!value) {
        return t('profile.notAvailable');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return t('profile.notAvailable');
    }

    return date.toLocaleString();
}

export function formatSessionOs(value: string | null | undefined, t: ProfileTranslator) {
    switch (value) {
        case 'Windows':
            return 'Windows';
        case 'macOS':
            return 'macOS';
        case 'Linux':
            return 'Linux';
        case 'iOS':
            return 'iOS';
        case 'Android':
            return 'Android';
        default:
            return t('profile.deviceUnknownOs');
    }
}

export function formatSessionDeviceType(value: string | null | undefined, t: ProfileTranslator) {
    switch (value) {
        case 'mobile':
            return t('profile.deviceType.mobile');
        case 'tablet':
            return t('profile.deviceType.tablet');
        default:
            return t('profile.deviceType.desktop');
    }
}

export function formatSessionBrowser(value: string | null | undefined, t: ProfileTranslator) {
    if (!value || value.toLowerCase().includes('unknown')) {
        return t('profile.deviceUnknownBrowser');
    }

    return value;
}

export function formatSessionDeviceLabel(session: AuthSessionItem, t: ProfileTranslator) {
    if (session.deviceLabel && !session.deviceLabel.toLowerCase().includes('unknown')) {
        return session.deviceLabel;
    }

    return `${formatSessionBrowser(session.browser, t)} / ${formatSessionOs(session.os, t)}`;
}
