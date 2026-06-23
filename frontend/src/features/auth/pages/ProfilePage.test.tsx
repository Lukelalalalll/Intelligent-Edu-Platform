import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfilePage from './ProfilePage';

const {
    navigateMock,
    updateProfileMock,
    logoutMock,
    getMock,
    postMock,
    deleteMock,
    successMock,
    errorMock,
    mockStore,
    loadGoogleIdentityScriptMock,
    initializeMock,
    renderButtonMock,
    getGoogleCallback,
} = vi.hoisted(() => {
    let googleCallback: ((response: { credential?: string }) => void) | null = null;

    return {
        navigateMock: vi.fn(),
        updateProfileMock: vi.fn(),
        logoutMock: vi.fn(),
        getMock: vi.fn(),
        postMock: vi.fn(),
        deleteMock: vi.fn(),
        successMock: vi.fn(),
        errorMock: vi.fn(),
        loadGoogleIdentityScriptMock: vi.fn(),
        initializeMock: vi.fn((config: { callback: (response: { credential?: string }) => void }) => {
            googleCallback = config.callback;
        }),
        renderButtonMock: vi.fn(),
        getGoogleCallback: () => googleCallback,
        mockStore: {
            user: {
                id: 'user-1',
                username: 'alice',
                email: 'alice@example.com',
                role: 'teacher' as const,
            },
            updateProfile: vi.fn(),
            logout: vi.fn(),
        },
    };
});

vi.mock('@/shared/auth/googleIdentity', () => ({
    loadGoogleIdentityScript: loadGoogleIdentityScriptMock,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock('@/shared/store/useAuthStore', () => ({
    useAuthStore: () => mockStore,
}));

vi.mock('@/shared/api/client', () => ({
    default: {
        get: getMock,
        post: postMock,
        delete: deleteMock,
    },
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: successMock,
        error: errorMock,
    },
}));

vi.mock('@/shared/i18n', () => ({
    useI18n: () => ({
        t: (key: string, vars?: Record<string, string | number>) =>
            vars ? `${key}:${Object.values(vars).join('|')}` : key,
    }),
}));

const securityState = {
    mfa: {
        enabled: false,
        totpConfigured: false,
        backupCodesRemaining: 0,
        preferredMethod: 'totp',
        enrolledAt: null,
    },
    enrollmentPending: {
        active: false,
        startedAt: null,
    },
};

const sessions = [
    {
        sessionId: 'session-current',
        createdAt: '2030-01-01T09:00:00Z',
        lastSeenAt: '2030-01-01T10:00:00Z',
        lastRotatedAt: '2030-01-01T10:00:00Z',
        expiresAt: '2030-01-10T10:00:00Z',
        current: true,
        amr: ['pwd'],
        browser: 'Chrome',
        os: 'Windows',
        deviceType: 'desktop',
        ipLabel: '127.0.0.1',
    },
    {
        sessionId: 'session-2',
        createdAt: '2030-01-02T09:00:00Z',
        lastSeenAt: '2030-01-02T10:00:00Z',
        lastRotatedAt: '2030-01-02T10:00:00Z',
        expiresAt: '2030-01-11T10:00:00Z',
        current: false,
        amr: ['pwd'],
        browser: 'Edge',
        os: 'Windows',
        deviceType: 'desktop',
        ipLabel: '192.168.0.10',
    },
];

function buildGoogleConnectionState() {
    if (!mockStore.user?.googleLinked) {
        return {
            linked: false,
            email: null,
            name: null,
            avatarUrl: null,
            linkedAt: null,
            canUnlink: false,
        };
    }

    return {
        linked: true,
        email: 'alice.google@example.com',
        name: 'Alice Example',
        avatarUrl: 'https://example.com/google-avatar.png',
        linkedAt: '2030-01-03T10:00:00Z',
        canUnlink: true,
    };
}

function mockInitialRequests() {
    getMock.mockImplementation(async (url: string) => {
        switch (url) {
            case '/profile/courses':
                return {
                    data: {
                        courses: [
                            {
                                courseId: 'CS101',
                                name: 'Intro to AI',
                                degreeLevel: 'Bachelor',
                                semester: '2026 Spring',
                            },
                        ],
                        semester: '2026 Spring',
                    },
                };
            case '/profile/history-settings':
                return {
                    data: {
                        history_ttl_days: 90,
                    },
                };
            case '/profile/security':
                return { data: securityState };
            case '/profile/connections/google':
                return { data: buildGoogleConnectionState() };
            case '/sessions':
                return { data: { sessions } };
            default:
                throw new Error(`Unexpected GET ${url}`);
        }
    });
}

function getInputByLabel(container: HTMLElement, labelText: string) {
    const label = Array.from(container.querySelectorAll('label')).find((item) => item.textContent === labelText);
    if (!label) {
        throw new Error(`Unable to find label: ${labelText}`);
    }

    const fieldWrapper = label.parentElement?.className.includes('formGroup')
        ? label.parentElement.querySelector('input')
        : label.nextElementSibling?.querySelector('input');

    if (!(fieldWrapper instanceof HTMLInputElement)) {
        throw new Error(`Unable to find input for label: ${labelText}`);
    }

    return fieldWrapper;
}

describe('ProfilePage', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_GOOGLE_AUTH_CLIENT_ID', 'google-client-id');
        mockStore.user = {
            id: 'user-1',
            username: 'alice',
            email: 'alice@example.com',
            role: 'teacher',
            googleLinked: false,
            avatarUrl: null,
        };
        mockStore.updateProfile = updateProfileMock;
        mockStore.logout = logoutMock;

        navigateMock.mockReset();
        updateProfileMock.mockReset();
        logoutMock.mockReset();
        getMock.mockReset();
        postMock.mockReset();
        deleteMock.mockReset();
        successMock.mockReset();
        errorMock.mockReset();
        loadGoogleIdentityScriptMock.mockReset();
        initializeMock.mockClear();
        renderButtonMock.mockClear();
        loadGoogleIdentityScriptMock.mockResolvedValue(undefined);
        (window as any).google = {
            accounts: {
                id: {
                    initialize: initializeMock,
                    renderButton: renderButtonMock,
                },
            },
        };

        mockInitialRequests();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the existing profile sections alongside the new account binding section', async () => {
        render(<ProfilePage />);

        expect(screen.getByText('profile.editTitle')).toBeInTheDocument();
        expect(screen.getByText('profile.historyTitle')).toBeInTheDocument();
        expect(screen.getByText('profile.securityTitle')).toBeInTheDocument();
        expect(screen.getByText('profile.accountBindingTitle')).toBeInTheDocument();
        expect(screen.getByText('profile.sessionsTitle')).toBeInTheDocument();

        await waitFor(() => expect(screen.getByText('Intro to AI')).toBeInTheDocument());
        await waitFor(() => expect(screen.getByTestId('profile-google-bind-button')).toBeInTheDocument());
        expect(screen.queryByText('auth.googleLinkTitle')).not.toBeInTheDocument();
    });

    it('shows the bound Google account summary when the profile is already linked', async () => {
        mockStore.user = {
            ...mockStore.user,
            googleLinked: true,
            avatarUrl: 'https://example.com/store-avatar.png',
        };

        render(<ProfilePage />);

        await waitFor(() => expect(screen.getByText('alice.google@example.com')).toBeInTheDocument());
        expect(screen.getByText('profile.googleLinkedHint')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'profile.googleUnlink' })).toBeInTheDocument();
    });

    it('shows the unbound Google state and renders the GIS button', async () => {
        render(<ProfilePage />);

        await waitFor(() => expect(screen.getByText('profile.googleDisconnectedSummary')).toBeInTheDocument());
        expect(screen.getByTestId('profile-google-bind-button')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'profile.googleUnlink' })).not.toBeInTheDocument();
    });

    it('binds Google successfully from the profile section', async () => {
        postMock.mockImplementation(async (url: string) => {
            if (url === '/profile/connections/google/link') {
                return {
                    data: {
                        user: {
                            googleLinked: true,
                            avatarUrl: 'https://example.com/google-avatar.png',
                        },
                        google: {
                            linked: true,
                            email: 'alice.google@example.com',
                            name: 'Alice Example',
                            avatarUrl: 'https://example.com/google-avatar.png',
                            linkedAt: '2030-01-03T10:00:00Z',
                            canUnlink: true,
                        },
                    },
                };
            }

            throw new Error(`Unexpected POST ${url}`);
        });

        render(<ProfilePage />);

        await waitFor(() => expect(initializeMock).toHaveBeenCalled());

        await act(async () => {
            getGoogleCallback()?.({ credential: 'google-credential' });
        });

        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/profile/connections/google/link', {
                credential: 'google-credential',
            });
            expect(updateProfileMock).toHaveBeenCalledWith({
                googleLinked: true,
                avatarUrl: 'https://example.com/google-avatar.png',
            });
            expect(successMock).toHaveBeenCalledWith('profile.googleLinkedSuccess');
        });

        expect(screen.getByText('alice.google@example.com')).toBeInTheDocument();
    });

    it('unlinks Google successfully from the profile section', async () => {
        mockStore.user = {
            ...mockStore.user,
            googleLinked: true,
            avatarUrl: 'https://example.com/store-avatar.png',
        };
        deleteMock.mockResolvedValue({
            data: {
                user: {
                    googleLinked: false,
                    avatarUrl: null,
                },
                google: {
                    linked: false,
                    email: null,
                    name: null,
                    avatarUrl: null,
                    linkedAt: null,
                    canUnlink: false,
                },
            },
        });

        const user = userEvent.setup();
        render(<ProfilePage />);

        await waitFor(() => expect(screen.getByRole('button', { name: 'profile.googleUnlink' })).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'profile.googleUnlink' }));

        await waitFor(() => {
            expect(deleteMock).toHaveBeenCalledWith('/profile/connections/google');
            expect(updateProfileMock).toHaveBeenCalledWith({
                googleLinked: false,
                avatarUrl: null,
            });
            expect(successMock).toHaveBeenCalledWith('profile.googleUnlinkedSuccess');
        });

        expect(screen.getByText('profile.googleDisconnectedSummary')).toBeInTheDocument();
    });

    it('surfaces API detail messages when Google binding fails', async () => {
        postMock.mockRejectedValue({
            response: {
                data: {
                    detail: 'Cannot link Google right now',
                },
            },
        });

        render(<ProfilePage />);

        await waitFor(() => expect(initializeMock).toHaveBeenCalled());

        await act(async () => {
            getGoogleCallback()?.({ credential: 'google-credential' });
        });

        await waitFor(() => {
            expect(errorMock).toHaveBeenCalledWith('Cannot link Google right now');
        });
    });

    it('opens the confirm modal and saves profile updates while clearing sensitive fields', async () => {
        const user = userEvent.setup();
        const { container } = render(<ProfilePage />);

        postMock.mockResolvedValue({ data: {} });

        const usernameInput = container.querySelector<HTMLInputElement>('#username');
        const emailInput = container.querySelector<HTMLInputElement>('#email');
        const currentPasswordInput = container.querySelector<HTMLInputElement>('#currentPassword');
        const newPasswordInput = container.querySelector<HTMLInputElement>('#password');

        if (!usernameInput || !emailInput || !currentPasswordInput || !newPasswordInput) {
            throw new Error('Expected profile form inputs to exist');
        }

        await user.clear(usernameInput);
        await user.type(usernameInput, 'alice updated');
        await user.clear(emailInput);
        await user.type(emailInput, 'alice.updated@example.com');
        await user.type(currentPasswordInput, 'current-secret');
        await user.click(screen.getByRole('button', { name: 'profile.saveChanges' }));

        expect(screen.getByText('profile.confirmTitle')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'profile.confirmUpdate' }));

        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/profile/update', {
                username: 'alice updated',
                email: 'alice.updated@example.com',
                current_password: 'current-secret',
                password: '',
            });
            expect(updateProfileMock).toHaveBeenCalledWith({
                username: 'alice updated',
                email: 'alice.updated@example.com',
            });
        });

        expect(currentPasswordInput).toHaveValue('');
        expect(newPasswordInput).toHaveValue('');
        expect(successMock).toHaveBeenCalledWith('profile.updated');
    });

    it('logs the user out and navigates back to login after a password change', async () => {
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const user = userEvent.setup();
        const { container } = render(<ProfilePage />);

        postMock.mockImplementation(async (url: string) => {
            if (url === '/profile/update' || url === '/logout') {
                return { data: {} };
            }

            throw new Error(`Unexpected POST ${url}`);
        });

        const currentPasswordInput = container.querySelector<HTMLInputElement>('#currentPassword');
        const newPasswordInput = container.querySelector<HTMLInputElement>('#password');

        if (!currentPasswordInput || !newPasswordInput) {
            throw new Error('Expected password inputs to exist');
        }

        await user.type(currentPasswordInput, 'current-secret');
        await user.type(newPasswordInput, 'new-secret');
        await user.click(screen.getByRole('button', { name: 'profile.saveChanges' }));
        await user.click(screen.getByRole('button', { name: 'profile.confirmUpdate' }));

        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/logout');
            expect(logoutMock).toHaveBeenCalled();
        });

        const callback = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 600)?.[0] as (() => void) | undefined;
        callback?.();
        expect(navigateMock).toHaveBeenCalledWith('/login');
        setTimeoutSpy.mockRestore();
    });

    it('rejects invalid history TTL input before posting', async () => {
        const { container } = render(<ProfilePage />);

        const ttlInput = getInputByLabel(container, 'profile.autoDeleteAfter');
        fireEvent.change(ttlInput, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'profile.saveSetting' }));

        await waitFor(() => expect(errorMock).toHaveBeenCalledWith('profile.ttlInvalid'));
        expect(postMock).not.toHaveBeenCalledWith('/profile/history-settings', expect.anything());
    });

    it('keeps the security actions wired to the existing endpoints', async () => {
        const user = userEvent.setup();
        const { container } = render(<ProfilePage />);

        postMock.mockImplementation(async (url: string) => {
            switch (url) {
                case '/profile/security/mfa/start':
                    return { data: { secret: 'SECRET-1', otpauthUri: 'otpauth://demo' } };
                case '/profile/security/mfa/confirm':
                    return { data: { backupCodes: ['code-1', 'code-2'] } };
                case '/step-up/verify':
                case '/profile/security/mfa/disable':
                    return { data: {} };
                case '/profile/security/mfa/backup-codes/regenerate':
                    return { data: { backupCodes: ['regen-1'] } };
                default:
                    throw new Error(`Unexpected POST ${url}`);
            }
        });

        const currentPasswordInput = container.querySelector<HTMLInputElement>('#currentPassword');
        if (!currentPasswordInput) {
            throw new Error('Expected current password input to exist');
        }

        await user.type(currentPasswordInput, 'current-secret');
        await user.click(screen.getByRole('button', { name: 'profile.startMfa' }));

        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/profile/security/mfa/start', {
                current_password: 'current-secret',
            });
        });

        await user.type(getInputByLabel(container, 'profile.mfaConfirmCode'), '123456');
        await user.click(screen.getByRole('button', { name: 'profile.confirmMfa' }));
        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/profile/security/mfa/confirm', {
                code: '123456',
            });
        });

        await user.type(getInputByLabel(container, 'profile.stepUpCode'), '654321');
        await user.click(screen.getByRole('button', { name: 'profile.verifyStepUp' }));
        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/step-up/verify', {
                code: '654321',
            });
        });

        await user.type(getInputByLabel(container, 'profile.mfaDisableCode'), '111111');
        await user.click(screen.getByRole('button', { name: 'profile.disableMfa' }));
        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/profile/security/mfa/disable', {
                current_password: 'current-secret',
                code: '111111',
            });
        });

        await user.click(screen.getByRole('button', { name: 'profile.regenerateBackupCodes' }));
        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/profile/security/mfa/backup-codes/regenerate', {
                current_password: 'current-secret',
            });
        });
    });

    it('prefers API detail messages for security failures', async () => {
        const user = userEvent.setup();
        const { container } = render(<ProfilePage />);

        postMock.mockRejectedValue({
            response: {
                data: {
                    detail: 'Bad MFA code',
                },
            },
        });

        await user.type(getInputByLabel(container, 'profile.mfaConfirmCode'), '123456');
        await user.click(screen.getByRole('button', { name: 'profile.confirmMfa' }));

        await waitFor(() => expect(errorMock).toHaveBeenCalledWith('Bad MFA code'));
    });

    it('revokes a non-current session and signs out every session', async () => {
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const user = userEvent.setup();
        render(<ProfilePage />);

        deleteMock.mockResolvedValue({ data: {} });
        postMock.mockResolvedValue({ data: {} });

        const revokeButton = await screen.findByRole('button', { name: 'profile.sessionsRevoke' });
        await user.click(revokeButton);
        await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('/sessions/session-2'));

        await user.click(screen.getByRole('button', { name: 'profile.sessionsSignOutAll' }));
        await waitFor(() => {
            expect(postMock).toHaveBeenCalledWith('/logout-all');
            expect(logoutMock).toHaveBeenCalled();
        });

        const callback = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 300)?.[0] as (() => void) | undefined;
        callback?.();
        expect(navigateMock).toHaveBeenCalledWith('/login');
        setTimeoutSpy.mockRestore();
    });
});
