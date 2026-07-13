import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import client from '@/shared/api/client';
import { loadGoogleIdentityScript, type GoogleButtonText } from '@/shared/auth/googleIdentity';
import { useI18n } from '@/shared/i18n';
import type { User } from '@/shared/store/useAuthStore';

import styles from '../styles/auth.module.css';

type GoogleMode = 'login' | 'register';

type LinkAccountState = {
  type: 'link_account';
  ticketId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type CompleteProfileState = {
  type: 'complete_profile';
  ticketId: string;
  email: string;
  suggestedUsername?: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type MfaState = {
  type: 'mfa_required';
  challengeId: string;
  expiresAt: string;
  method: string;
};

type GoogleState =
  | { type: 'idle' }
  | LinkAccountState
  | CompleteProfileState
  | MfaState;

type AuthenticatedResponse = {
  action: 'authenticated';
  mfaRequired: false;
  user: User;
};

type MfaRequiredResponse = {
  action: 'mfa_required';
  mfaRequired: true;
  challengeId: string;
  expiresAt: string;
  method: string;
};

type LinkAccountResponse = {
  action: 'link_account';
  ticketId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type CompleteProfileResponse = {
  action: 'complete_profile';
  ticketId: string;
  email: string;
  suggestedUsername?: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type GoogleAuthResponse =
  | AuthenticatedResponse
  | MfaRequiredResponse
  | LinkAccountResponse
  | CompleteProfileResponse;

interface GoogleAuthSectionProps {
  mode: GoogleMode;
  onAuthenticated: (user: User) => void;
}

function isMfaRequired(response: GoogleAuthResponse): response is MfaRequiredResponse {
  return response.action === 'mfa_required' || Boolean((response as { mfaRequired?: boolean }).mfaRequired);
}

export default function GoogleAuthSection({ mode, onAuthenticated }: GoogleAuthSectionProps) {
  const { t } = useI18n();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const clientId = useMemo(() => import.meta.env.VITE_GOOGLE_AUTH_CLIENT_ID?.trim() || '', []);

  const [googleState, setGoogleState] = useState<GoogleState>({ type: 'idle' });
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [isStaff, setIsStaff] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isUnavailable, setIsUnavailable] = useState(false);

  const resetMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const resetFlow = () => {
    setGoogleState({ type: 'idle' });
    setPassword('');
    setUsername('');
    setStaffCode('');
    setMfaCode('');
    setIsStaff(false);
    setIsLoading(false);
    resetMessages();
  };

  const handleGoogleResponse = (response: GoogleAuthResponse) => {
    resetMessages();

    if (response.action === 'authenticated') {
      onAuthenticated(response.user);
      return;
    }

    if (isMfaRequired(response)) {
      setGoogleState({
        type: 'mfa_required',
        challengeId: response.challengeId,
        expiresAt: response.expiresAt,
        method: response.method,
      });
      setMfaCode('');
      setSuccessMsg(t('auth.mfaRequired'));
      return;
    }

    if (response.action === 'link_account') {
      setGoogleState({
        type: 'link_account',
        ticketId: response.ticketId,
        email: response.email,
        name: response.name,
        avatarUrl: response.avatarUrl,
      });
      setPassword('');
      return;
    }

    setGoogleState({
      type: 'complete_profile',
      ticketId: response.ticketId,
      email: response.email,
      suggestedUsername: response.suggestedUsername,
      name: response.name,
      avatarUrl: response.avatarUrl,
    });
    setUsername(response.suggestedUsername || '');
    setStaffCode('');
    setIsStaff(false);
  };

  const submitGoogleCredential = async (credential: string) => {
    setIsLoading(true);
    resetMessages();
    try {
      const response = await client.post<GoogleAuthResponse>('/login/google', { credential });
      handleGoogleResponse(response.data);
    } catch (error: any) {
      setErrorMsg(error.response?.data?.detail || error.response?.data?.message || t('auth.googleLoginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId || googleState.type !== 'idle' || !buttonContainerRef.current) {
      return;
    }

    let cancelled = false;
    const buttonText: GoogleButtonText = mode === 'register' ? 'signup_with' : 'continue_with';

    void loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !buttonContainerRef.current || !window.google?.accounts?.id) {
          return;
        }

        const buttonContainer = buttonContainerRef.current;
        buttonContainer.innerHTML = '';

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            if (!credential) {
              setErrorMsg(t('auth.googleLoginFailed'));
              return;
            }
            void submitGoogleCredential(credential);
          },
        });

        const width = Math.max(240, Math.floor(buttonContainer.clientWidth || 320));
        window.google.accounts.id.renderButton(buttonContainer, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: buttonText,
          width,
        });
        setIsUnavailable(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsUnavailable(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, googleState.type, mode, t]);

  const handleLinkSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (googleState.type !== 'link_account' || !password.trim()) {
      setErrorMsg(t('auth.fillAll'));
      return;
    }

    setIsLoading(true);
    resetMessages();
    try {
      const response = await client.post<GoogleAuthResponse>('/login/google/link', {
        ticket_id: googleState.ticketId,
        password,
      });
      handleGoogleResponse(response.data);
    } catch (error: any) {
      setErrorMsg(error.response?.data?.detail || error.response?.data?.message || t('auth.googleLoginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (googleState.type !== 'complete_profile' || !username.trim()) {
      setErrorMsg(t('auth.fillAll'));
      return;
    }
    if (isStaff && staffCode.trim().length !== 8) {
      setErrorMsg(t('auth.staffCodeInvalid'));
      return;
    }

    setIsLoading(true);
    resetMessages();
    try {
      const response = await client.post<GoogleAuthResponse>('/login/google/complete', {
        ticket_id: googleState.ticketId,
        username: username.trim(),
        staff_code: isStaff ? staffCode.trim().toUpperCase() : undefined,
      });
      handleGoogleResponse(response.data);
    } catch (error: any) {
      setErrorMsg(error.response?.data?.detail || error.response?.data?.message || t('auth.googleLoginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (googleState.type !== 'mfa_required' || !mfaCode.trim()) {
      setErrorMsg(t('auth.fillAll'));
      return;
    }

    setIsLoading(true);
    resetMessages();
    try {
      const response = await client.post<{ user: User }>('/login/mfa/verify', {
        challenge_id: googleState.challengeId,
        code: mfaCode.trim(),
      });
      setSuccessMsg(t('auth.mfaVerified'));
      onAuthenticated(response.data.user);
    } catch (error: any) {
      setErrorMsg(error.response?.data?.detail || error.response?.data?.message || t('auth.verificationFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const renderIdentitySummary = (state: LinkAccountState | CompleteProfileState) => (
    <div className={styles.googleIdentitySummary}>
      {state.avatarUrl ? (
        <img className={styles.googleAvatar} src={state.avatarUrl} alt={state.email} />
      ) : (
        <div className={styles.googleAvatarFallback}>G</div>
      )}
      <div className={styles.googleIdentityMeta}>
        <strong>{state.name || state.email}</strong>
        <span>{state.email}</span>
      </div>
    </div>
  );

  const mfaExpiryText =
    googleState.type === 'mfa_required' && googleState.expiresAt
      ? new Date(googleState.expiresAt).toLocaleTimeString()
      : '';

  return (
    <div className={styles.googleSection}>
      <div className={styles.authDivider}>
        <span>{t('auth.orContinueWith')}</span>
      </div>

      <div className={`${styles.message} ${styles.errorMessage}`} style={{ display: errorMsg ? 'flex' : 'none' }}>
        <i className="fas fa-exclamation-circle"></i> <span>{errorMsg}</span>
      </div>
      <div className={`${styles.message} ${styles.successMessage}`} style={{ display: successMsg ? 'flex' : 'none' }}>
        <i className="fas fa-check-circle"></i> <span>{successMsg}</span>
      </div>

      {!clientId || isUnavailable ? (
        <div className={styles.googleUnavailable}>{t('auth.googleUnavailable')}</div>
      ) : null}

      {clientId && !isUnavailable && googleState.type === 'idle' ? (
        <div className={styles.googleButtonWrapper}>
          <div
            ref={buttonContainerRef}
            className={styles.googleButtonContainer}
            data-testid="google-auth-button"
          />
        </div>
      ) : null}

      {googleState.type === 'link_account' ? (
        <form className={`${styles.googleFollowUpForm} ${styles.authForm}`} onSubmit={handleLinkSubmit}>
          <div className={styles.googleSectionTitle}>{t('auth.googleLinkTitle')}</div>
          <p className={styles.googleHelperText}>{t('auth.googleLinkSubtitle')}</p>
          {renderIdentitySummary(googleState)}

          <div className={styles.inputGroup}>
            <div className={styles.inputIcon}><i className="fas fa-lock"></i></div>
            <input
              type="password"
              id="google-link-password"
              placeholder=" "
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label htmlFor="google-link-password">{t('auth.password')}</label>
          </div>

          <button type="submit" className={styles.btnSubmit} disabled={isLoading}>
            {isLoading ? t('auth.signingIn') : t('auth.linkAccount')}
          </button>
          <button type="button" className={styles.secondaryAction} onClick={resetFlow}>
            {t('auth.useDifferentAccount')}
          </button>
        </form>
      ) : null}

      {googleState.type === 'complete_profile' ? (
        <form className={`${styles.googleFollowUpForm} ${styles.authForm}`} onSubmit={handleCompleteSubmit}>
          <div className={styles.googleSectionTitle}>{t('auth.googleCompleteTitle')}</div>
          <p className={styles.googleHelperText}>{t('auth.googleCompleteSubtitle')}</p>
          {renderIdentitySummary(googleState)}

          <div className={styles.inputGroup}>
            <div className={styles.inputIcon}><i className="fas fa-user"></i></div>
            <input
              type="text"
              id="google-complete-username"
              placeholder=" "
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <label htmlFor="google-complete-username">{t('auth.username')}</label>
          </div>

          <p className={styles.googleHelperText}>{t('auth.googleUsernameHint')}</p>

          <div className={styles.roleToggle}>
            <button
              type="button"
              className={`${styles.roleToggleButton}${!isStaff ? ` ${styles.roleToggleButtonActive}` : ''}`}
              onClick={() => setIsStaff(false)}
            >
              {t('auth.student')}
            </button>
            <button
              type="button"
              className={`${styles.roleToggleButton}${isStaff ? ` ${styles.roleToggleButtonActive}` : ''}`}
              onClick={() => setIsStaff(true)}
            >
              {t('auth.staff')}
            </button>
          </div>

          {isStaff ? (
            <div className={styles.inputGroup}>
              <div className={styles.inputIcon}><i className="fas fa-key"></i></div>
              <input
                type="text"
                id="google-complete-staff-code"
                placeholder=" "
                value={staffCode}
                maxLength={8}
                onChange={(event) => setStaffCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}
              />
              <label htmlFor="google-complete-staff-code">{t('auth.staffCode')}</label>
            </div>
          ) : null}

          <button type="submit" className={styles.btnSubmit} disabled={isLoading}>
            {isLoading ? t('auth.creating') : t('auth.completeProfile')}
          </button>
          <button type="button" className={styles.secondaryAction} onClick={resetFlow}>
            {t('auth.useDifferentAccount')}
          </button>
        </form>
      ) : null}

      {googleState.type === 'mfa_required' ? (
        <form className={`${styles.googleFollowUpForm} ${styles.authForm}`} onSubmit={handleMfaSubmit}>
          <div className={styles.googleSectionTitle}>{t('auth.mfaTitle')}</div>
          <p className={styles.googleHelperText}>{t('auth.mfaSubtitle')}</p>
          <div className={styles.mfaNotice}>
            <strong>{t('auth.mfaRequired')}</strong>
            <span>{t('auth.mfaExpiry', { time: mfaExpiryText || '--' })}</span>
          </div>

          <div className={styles.inputGroup}>
            <div className={styles.inputIcon}><i className="fas fa-key"></i></div>
            <input
              type="text"
              id="google-mfa-code"
              placeholder=" "
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
            />
            <label htmlFor="google-mfa-code">{t('auth.mfaCode')}</label>
          </div>

          <button type="submit" className={styles.btnSubmit} disabled={isLoading}>
            {isLoading ? t('auth.signingIn') : t('auth.verifyMfa')}
          </button>
          <button type="button" className={styles.secondaryAction} onClick={resetFlow}>
            {t('auth.useDifferentAccount')}
          </button>
        </form>
      ) : null}
    </div>
  );
}
