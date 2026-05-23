import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import client from './api/client';
import { useAuthStore } from './store/useAuthStore';

const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const storeUser = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    let alive = true;

    const checkSession = async () => {
      if (!storeUser) {
        if (alive) {
          setIsAuthed(false);
          setIsChecking(false);
        }
        return;
      }

      const now = Date.now();
      if (now - lastCheckRef.current < SESSION_CHECK_INTERVAL) {
        if (alive) {
          setIsAuthed(true);
          setIsChecking(false);
        }
        return;
      }

      try {
        const res = await client.get('/session');
        if (!alive) return;

        lastCheckRef.current = Date.now();
        const freshUser = (res as { data?: { user?: unknown } })?.data?.user;
        if (freshUser) {
          updateProfile(freshUser as Record<string, unknown>);
        }
        setIsAuthed(true);
      } catch (err) {
        if (!alive) return;
        // On network error, trust the in-memory store so the page still renders
        const stillHasUser = !!useAuthStore.getState().user;
        setIsAuthed(stillHasUser);
      } finally {
        if (alive) {
          setIsChecking(false);
        }
      }
    };

    checkSession();

    return () => {
      alive = false;
    };
  }, []); // Only run on mount — not on every pathname change

  if (isChecking) return null;

  if (!isAuthed) {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
};

export default ProtectedRoute;
