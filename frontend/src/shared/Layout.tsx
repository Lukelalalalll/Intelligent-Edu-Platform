import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import client from './api/client';
import { log } from './utils/logger';
import { safeJsonParse } from './utils/safeJsonParse';
import { useAuthStore } from './store/useAuthStore';
import { useChatWebSocket, useChatRooms } from '@/features/chat';
import NetworkBanner from './NetworkBanner';
import Navbar from './layout/Navbar';
import Sidebar from './layout/Sidebar';
import Footer from './layout/Footer';

import styles from './Layout.module.css';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const storeUser = useAuthStore((s) => s.user);
  const storeLogout = useAuthStore((s) => s.logout);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('sidebarOpen');
    return stored === null ? true : stored === 'true';
  });

  const isAuthPage = ['/login', '/register', '/forgot-password'].includes(location.pathname);
  const isChatPage = location.pathname.startsWith('/chat');
  const isAIPage = location.pathname === '/ai-interaction';

  // Keep chat state synced globally so sidebar unread badge updates in real time.
  useChatWebSocket(!isAuthPage);
  useChatRooms(!isAuthPage);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      localStorage.setItem('sidebarOpen', String(!prev));
      return !prev;
    });
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
    <div className={`${styles.appShell} ${!isAuthPage && storeUser ? styles.withSidebar : ''} ${sidebarOpen ? styles.sidebarExpanded : ''}`}>
      <NetworkBanner />

      <Navbar
        user={storeUser}
        sidebarOpen={sidebarOpen}
        isAuthPage={isAuthPage}
        onToggleSidebar={toggleSidebar}
        onLogout={handleLogout}
      />

      <Sidebar user={storeUser} isAuthPage={isAuthPage} sidebarOpen={sidebarOpen} />

      <main
        className={`${styles.mainContent}${isAIPage ? ' ' + styles.mainContentNoScroll : ''}`}
        style={isChatPage ? { gridRow: '2 / span 2' } : {}}
      >
        <Outlet />
      </main>

      {!isChatPage && !isAIPage && <Footer />}
    </div>
  );
}
