import { useEffect } from 'react';

import client from '../api/client';
import { SESSION_CHECK_INTERVAL, useAuthStore, type User } from '../store/useAuthStore';

let sessionCheckPromise: Promise<void> | null = null;

function shouldRefreshSession() {
  const { user, status, isSessionLoading, lastValidatedAt } = useAuthStore.getState();
  if (isSessionLoading) return false;
  if (status === 'unknown') return true;
  if (!user) return false;
  return Date.now() - lastValidatedAt >= SESSION_CHECK_INTERVAL;
}

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

export function useAuthBootstrap() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);
  const lastValidatedAt = useAuthStore((s) => s.lastValidatedAt);

  useEffect(() => {
    void ensureSession();
  }, [user, status, isSessionLoading, lastValidatedAt]);

  useEffect(() => {
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
  }, []);
}
