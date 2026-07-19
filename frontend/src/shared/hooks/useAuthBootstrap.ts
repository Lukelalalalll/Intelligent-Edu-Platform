import { useEffect } from 'react';

import client from '../api/client';
import { SESSION_CHECK_INTERVAL, useAuthStore, type User } from '../store/useAuthStore';
import { shouldBypassAuthBootstrap as shouldBypassPptGeneratorAuthBootstrap } from '@/ppt_generator/routeMeta';

let sessionCheckPromise: Promise<void> | null = null;

/** Returns true when the current auth snapshot is missing or older than the refresh window. */
function shouldRefreshSession() {
  const { user, status, isSessionLoading, lastValidatedAt } = useAuthStore.getState();
  if (isSessionLoading) return false;
  if (status === 'unknown') return true;
  if (!user) return false;
  return Date.now() - lastValidatedAt >= SESSION_CHECK_INTERVAL;
}

/**
 * Validates the browser session while de-duplicating concurrent bootstrap checks.
 * Non-401 failures keep the previous auth snapshot so transient outages do not log users out.
 */
async function ensureSession(force = false) {
  if (sessionCheckPromise) {
    return sessionCheckPromise;
  }

  if (!force && !shouldRefreshSession()) {
    return;
  }

  useAuthStore.getState().beginSessionCheck();

  sessionCheckPromise = (async () => {
    try {
      const res = await client.get('/session');
      const freshUser = (res as { data?: { user?: unknown } })?.data?.user;
      useAuthStore.getState().completeSessionCheck((freshUser as User | null) ?? null, {
        validatedAt: Date.now(),
      });
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        useAuthStore.getState().completeSessionCheck(null, { validatedAt: Date.now() });
      } else {
        const fallbackUser = useAuthStore.getState().user;
        useAuthStore.setState({
          user: fallbackUser,
          status: fallbackUser ? 'authenticated' : 'anonymous',
          isSessionLoading: false,
          lastValidatedAt: Date.now(),
        });
      }
    } finally {
      sessionCheckPromise = null;
    }
  })();

  return sessionCheckPromise;
}

/** Returns true for routes that own auth/session handling outside the shared shell. */
export function shouldBypassAuthBootstrap(pathname: string) {
  return shouldBypassPptGeneratorAuthBootstrap(pathname);
}

/**
 * Keeps the auth store synchronized with the server session during app bootstrap.
 * The hook also revalidates when the tab returns to the foreground.
 */
export function useAuthBootstrap(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);
  const lastValidatedAt = useAuthStore((s) => s.lastValidatedAt);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void ensureSession();
  }, [enabled, user, status, isSessionLoading, lastValidatedAt]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void ensureSession();
      }
    };

    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled]);
}
