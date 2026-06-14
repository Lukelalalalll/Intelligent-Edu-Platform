import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GoogleAuthSection from './GoogleAuthSection';

const {
  postMock,
  loadGoogleIdentityScriptMock,
  initializeMock,
  renderButtonMock,
  getGoogleCallback,
} = vi.hoisted(() => {
  let googleCallback: ((response: { credential?: string }) => void) | null = null;
  return {
    postMock: vi.fn(),
    loadGoogleIdentityScriptMock: vi.fn(),
    initializeMock: vi.fn((config: { callback: (response: { credential?: string }) => void }) => {
      googleCallback = config.callback;
    }),
    renderButtonMock: vi.fn(),
    getGoogleCallback: () => googleCallback,
  };
});

vi.mock('@/shared/api/client', () => ({
  default: { post: postMock },
}));

vi.mock('@/shared/auth/googleIdentity', () => ({
  loadGoogleIdentityScript: loadGoogleIdentityScriptMock,
}));

vi.mock('@/shared/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      key === 'auth.mfaExpiry' ? `auth.mfaExpiry:${vars?.time ?? ''}` : key,
  }),
}));

const fakeUser = {
  id: 'user-1',
  username: 'alice',
  email: 'alice@example.com',
  role: 'student' as const,
  googleLinked: true,
};

describe('GoogleAuthSection', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_AUTH_CLIENT_ID', 'google-client-id');
    postMock.mockReset();
    loadGoogleIdentityScriptMock.mockReset();
    initializeMock.mockReset();
    renderButtonMock.mockReset();
    loadGoogleIdentityScriptMock.mockResolvedValue(undefined);
    (window as any).google = {
      accounts: {
        id: {
          initialize: initializeMock,
          renderButton: renderButtonMock,
        },
      },
    };
  });

  it('renders the Google button container and initializes GIS', async () => {
    render(<GoogleAuthSection mode="login" onAuthenticated={vi.fn()} />);

    expect(screen.getByTestId('google-auth-button')).toBeInTheDocument();
    await waitFor(() => expect(loadGoogleIdentityScriptMock).toHaveBeenCalled());
    await waitFor(() => expect(initializeMock).toHaveBeenCalled());
    expect(renderButtonMock).toHaveBeenCalled();
  });

  it('authenticates immediately when backend returns authenticated', async () => {
    const onAuthenticated = vi.fn();
    postMock.mockResolvedValue({ data: { action: 'authenticated', mfaRequired: false, user: fakeUser } });

    render(<GoogleAuthSection mode="login" onAuthenticated={onAuthenticated} />);

    await waitFor(() => expect(initializeMock).toHaveBeenCalled());

    await act(async () => {
      getGoogleCallback()?.({ credential: 'google-credential' });
    });

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/login/google', { credential: 'google-credential' });
      expect(onAuthenticated).toHaveBeenCalledWith(fakeUser);
    });
  });

  it('shows the link-account form when backend requires linking', async () => {
    const onAuthenticated = vi.fn();
    postMock
      .mockResolvedValueOnce({
        data: { action: 'link_account', ticketId: 'ticket-1', email: 'alice@example.com' },
      })
      .mockResolvedValueOnce({
        data: { action: 'authenticated', mfaRequired: false, user: fakeUser },
      });

    render(<GoogleAuthSection mode="login" onAuthenticated={onAuthenticated} />);

    await waitFor(() => expect(initializeMock).toHaveBeenCalled());
    await act(async () => {
      getGoogleCallback()?.({ credential: 'google-credential' });
    });

    await waitFor(() => expect(screen.getByText('auth.googleLinkTitle')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('auth.password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'auth.linkAccount' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/login/google/link', {
        ticket_id: 'ticket-1',
        password: 'secret-password',
      });
      expect(onAuthenticated).toHaveBeenCalledWith(fakeUser);
    });
  });

  it('shows the complete-profile form when backend requires username completion', async () => {
    postMock.mockResolvedValue({
      data: {
        action: 'complete_profile',
        ticketId: 'ticket-2',
        email: 'new@example.com',
        suggestedUsername: 'new-user',
      },
    });

    render(<GoogleAuthSection mode="register" onAuthenticated={vi.fn()} />);

    await waitFor(() => expect(initializeMock).toHaveBeenCalled());
    await act(async () => {
      getGoogleCallback()?.({ credential: 'google-credential' });
    });

    await waitFor(() => expect(screen.getByText('auth.googleCompleteTitle')).toBeInTheDocument());
    expect(screen.getByLabelText('auth.username')).toHaveValue('new-user');
    expect(screen.getByRole('button', { name: 'auth.completeProfile' })).toBeInTheDocument();
  });

  it('reuses the MFA form when Google login requires MFA', async () => {
    const onAuthenticated = vi.fn();
    postMock
      .mockResolvedValueOnce({
        data: {
          action: 'mfa_required',
          mfaRequired: true,
          challengeId: 'challenge-1',
          expiresAt: '2030-01-01T12:00:00Z',
          method: 'totp',
        },
      })
      .mockResolvedValueOnce({ data: { user: fakeUser } });

    render(<GoogleAuthSection mode="login" onAuthenticated={onAuthenticated} />);

    await waitFor(() => expect(initializeMock).toHaveBeenCalled());
    await act(async () => {
      getGoogleCallback()?.({ credential: 'google-credential' });
    });

    await waitFor(() => expect(screen.getByText('auth.mfaTitle')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('auth.mfaCode'), '123456');
    await user.click(screen.getByRole('button', { name: 'auth.verifyMfa' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/login/mfa/verify', {
        challenge_id: 'challenge-1',
        code: '123456',
      });
      expect(onAuthenticated).toHaveBeenCalledWith(fakeUser);
    });
  });
});
