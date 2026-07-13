import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import client from './api/client';
import { log } from './utils/logger';
import { useAuthStore } from './store/useAuthStore';
import { useChatUnreadSync } from '@/features/chat/hooks/useChatUnreadSync';
import NetworkBanner from './NetworkBanner';
import Navbar from './layout/Navbar';
import Sidebar from './layout/Sidebar';
import Footer from './layout/Footer';
import { isEdgeToEdgeRoute } from './layoutRouteUtils';

import styles from './Layout.module.css';

const SIDEBAR_ANIMATION_MS = 220;

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const storeUser = useAuthStore((s) => s.user);
  const storeLogout = useAuthStore((s) => s.logout);
  const authStatus = useAuthStore((s) => s.status);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = typeof window !== 'undefined' && 'localStorage' in window
      ? window.localStorage?.getItem('sidebarOpen')
      : null;
    return stored === null ? true : stored === 'true';
  });
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const sidebarAnimationTimerRef = useRef<number | null>(null);

  const isAuthPage = ['/login', '/register', '/forgot-password'].includes(location.pathname);
  const isChatPage = location.pathname.startsWith('/chat');
  const isAIPage = location.pathname === '/ai-interaction';
  const isEdgeToEdgePage = isEdgeToEdgeRoute(location.pathname);
  const isAuthPending = !isAuthPage && (authStatus === 'unknown' || (isSessionLoading && !storeUser));

  useChatUnreadSync(Boolean(storeUser) && !isAuthPage && !isChatPage);

  useEffect(() => () => {
    if (sidebarAnimationTimerRef.current !== null) {
      window.clearTimeout(sidebarAnimationTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncLayoutOverlayOffset = () => {
      const hasPersistentSidebar =
        !isAuthPage &&
        Boolean(storeUser) &&
        !window.matchMedia('(max-width: 768px)').matches &&
        sidebarOpen;
      root.style.setProperty(
        '--layout-overlay-sidebar-offset',
        hasPersistentSidebar ? 'var(--sidebar-width)' : '0px',
      );
    };

    syncLayoutOverlayOffset();
    window.addEventListener('resize', syncLayoutOverlayOffset);

    return () => {
      window.removeEventListener('resize', syncLayoutOverlayOffset);
      root.style.removeProperty('--layout-overlay-sidebar-offset');
    };
  }, [isAuthPage, sidebarOpen, storeUser]);

  const toggleSidebar = () => {
    if (sidebarAnimationTimerRef.current !== null) {
      window.clearTimeout(sidebarAnimationTimerRef.current);
    }

    setSidebarAnimating(true);
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarOpen', String(next));
      return next;
    });

    sidebarAnimationTimerRef.current = window.setTimeout(() => {
      setSidebarAnimating(false);
      sidebarAnimationTimerRef.current = null;
    }, SIDEBAR_ANIMATION_MS);
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await client.post('/logout');
    } catch (error: unknown) {
      log.error('layout', 'Logout request failed', { message: (error as Error)?.message });
    } finally {
      storeLogout();
      navigate('/login');
    }
  };

  return (
    <div
      className={`${styles.appShell} ${!isAuthPage && storeUser ? styles.withSidebar : ''} ${sidebarOpen ? styles.sidebarExpanded : ''}`}
      data-sidebar-open={sidebarOpen ? 'true' : 'false'}
      data-sidebar-animating={sidebarAnimating ? 'true' : 'false'}
    >
      <NetworkBanner />

      <Navbar
        user={storeUser}
        sidebarOpen={sidebarOpen}
        isAuthPage={isAuthPage}
        isAuthPending={isAuthPending}
        onToggleSidebar={toggleSidebar}
        onLogout={handleLogout}
      />

      <Sidebar
        user={storeUser}
        isAuthPage={isAuthPage}
        sidebarOpen={sidebarOpen}
        sidebarAnimating={sidebarAnimating}
      />

      <main
        className={`${styles.mainContent}${isAIPage ? ' ' + styles.mainContentNoScroll : ''}${isEdgeToEdgePage ? ' ' + styles.mainContentEdgeToEdge : ''}`}
        style={isChatPage ? { gridRow: '2 / span 2' } : {}}
      >
        <Outlet />
      </main>

      {!isChatPage && !isAIPage && <Footer />}
    </div>
  );
}
