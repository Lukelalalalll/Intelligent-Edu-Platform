import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import logoImg from '../assets/hku_logo.png';
import { log } from '../utils/logger';
import type { User } from '../types/api';
import { useChatStore } from '../features/chat/store/chatStore';
import { useChatWebSocket } from '../features/chat/hooks/useChatWebSocket';
import { useChatRooms } from '../features/chat/hooks/useChatRooms';
import NetworkBanner from './NetworkBanner';

// 1. 引入全局样式
import '../styles/base.css';
// 2. 引入 Module 样式
import styles from './Layout.module.css';

interface NavLink {
    to: string;
    label: string;
    icon: string;
    tone?: string;
}

interface NavSection {
    title: string;
    links: NavLink[];
}

const NAV_SECTIONS: NavSection[] = [
    {
        title: 'Main',
        links: [
            { to: '/', label: 'Home', icon: 'fa-home' },
            { to: '/home_student', label: 'Student View', icon: 'fa-graduation-cap' },
            { to: '/chat', label: 'Chat', icon: 'fa-comments' },
        ],
    },
    {
        title: 'AI Tools',
        links: [
            { to: '/ai-interaction', label: 'AI Workspace', icon: 'fa-robot' },
            { to: '/knowledge-base', label: 'Knowledge Base', icon: 'fa-database' },
        ],
    },
    {
        title: 'Workflow',
        links: [
            { to: '/?tab=tools', label: 'Tools', icon: 'fa-toolbox' },
            { to: '/mailbox', label: 'Mailbox', icon: 'fa-inbox' },
        ],
    },
];

const STUDENT_NAV_SECTIONS: NavSection[] = [
    {
        title: 'Main',
        links: [
            { to: '/home_student', label: 'Home', icon: 'fa-home' },
            { to: '/chat', label: 'Chat', icon: 'fa-comments' },
        ],
    },
    {
        title: 'AI Tools',
        links: [
            { to: '/ai-interaction', label: 'AI Workspace', icon: 'fa-robot' },
        ],
    },
];

const TEACHER_NAV_SECTIONS: NavSection[] = [
    {
        title: 'Main',
        links: [
            { to: '/', label: 'Home', icon: 'fa-home' },
            { to: '/chat', label: 'Chat', icon: 'fa-comments' },
        ],
    },
    {
        title: 'AI Tools',
        links: [
            { to: '/ai-interaction', label: 'AI Workspace', icon: 'fa-robot' },
            { to: '/knowledge-base', label: 'Knowledge Base', icon: 'fa-database' },
        ],
    },
    {
        title: 'Workflow',
        links: [
            { to: '/?tab=tools', label: 'Tools', icon: 'fa-toolbox' },
            { to: '/mailbox', label: 'Mailbox', icon: 'fa-inbox' },
        ],
    },
];

const ADMIN_SECTION: NavSection = {
    title: 'Admin',
    links: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: 'fa-shield-alt', tone: 'admin' },
        { to: '/admin/file-center', label: 'File Center', icon: 'fa-folder-tree', tone: 'admin' },
        { to: '/admin/db-console', label: 'Database', icon: 'fa-database', tone: 'database' },
    ],
};

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        const stored = localStorage.getItem('sidebarOpen');
        return stored === null ? true : stored === 'true';
    });
    const isAuthPage = ['/login', '/register', '/forgot-password'].includes(location.pathname);
    const isChatPage = location.pathname.startsWith('/chat');

    // Keep chat state synced globally so sidebar unread badge updates in real time.
    // useChatWebSocket handles its own auth guard internally (reads localStorage).
    // useChatRooms relies on cookie-based auth like all other API calls.
    useChatWebSocket(!isAuthPage);
    useChatRooms(!isAuthPage);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            setUser(null);
        }
    }, [location]);

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
        } catch (error) {
            log.error('layout', 'Logout request failed', { message: error?.message });
        } finally {
            localStorage.removeItem('user');
            setUser(null);
            navigate('/login');
        }
    };

    const isLinkActive = (to: string): boolean => {
        const currentTab = new URLSearchParams(location.search).get('tab');
        if (to === '/?tab=tools') return location.pathname === '/' && currentTab === 'tools';
        if (to === '/') return location.pathname === '/' && currentTab !== 'tools';
        return location.pathname === to;
    };

    const sections = user?.role === 'admin'
        ? [
            ...NAV_SECTIONS,
            {
                ...ADMIN_SECTION,
                links: [
                    ...ADMIN_SECTION.links,
                    location.pathname === '/home_student'
                        ? { to: '/', label: 'Teacher View', icon: 'fa-chalkboard-teacher', tone: 'teacher' }
                        : { to: '/home_student', label: 'Student View', icon: 'fa-graduation-cap', tone: 'student' },
                ],
            },
        ]
        : user?.role === 'student'
            ? STUDENT_NAV_SECTIONS
            : user?.role === 'teacher'
                ? TEACHER_NAV_SECTIONS
                : NAV_SECTIONS;

    const totalUnread = useChatStore((s) =>
        Object.values(s.unreadCounts).reduce((sum, n) => sum + n, 0)
    );

    const getToneClassName = (tone?: string): string => {
        if (tone === 'admin') return styles.sidebarLinkToneAdmin;
        if (tone === 'database') return styles.sidebarLinkToneDatabase;
        if (tone === 'teacher') return styles.sidebarLinkToneTeacher;
        if (tone === 'student') return styles.sidebarLinkToneStudent;
        return '';
    };

    return (
        <div className={`${styles.appShell} ${!isAuthPage && user ? styles.withSidebar : ''} ${sidebarOpen ? styles.sidebarExpanded : ''}`}>
            {/* ── Offline detection banner ── */}
            <NetworkBanner />

            {/* ── Top Navbar ── */}
            <header className={styles.navbar}>
                <div className={styles.navContainer}>
                    <div className={styles.navLeft}>
                        {!isAuthPage && user && (
                            <button
                                type="button"
                                className={styles.sidebarToggle}
                                onClick={toggleSidebar}
                                aria-label="Toggle sidebar"
                                aria-expanded={sidebarOpen}
                            >
                                <i className={`fas ${sidebarOpen ? 'fa-indent' : 'fa-outdent'}`}></i>
                            </button>
                        )}

                        <div className={styles.navLogo}>
                            <Link to={user?.role === 'student' ? '/home_student' : '/'}>
                                <img src={logoImg} alt="HKU Logo" className={styles.logoImg} />
                            </Link>
                        </div>
                    </div>

                    <div className={styles.navMenu}>
                        {user ? (
                            <div className={styles.userProfile}>
                                <span className={styles.welcomeText}>Hi, <strong>{user.username}</strong></span>

                                <Link to="/profile" className={styles.btnProfile}>
                                    <i className="fas fa-user-circle"></i> <span>Profile</span>
                                </Link>

                                <button onClick={handleLogout} className={styles.btnLogout}>
                                    <i className="fas fa-sign-out-alt"></i> <span>Logout</span>
                                </button>
                            </div>
                        ) : (
                            <>
                                <Link to="/login" className={`${styles.navBtn} ${styles.btnLogin}`}>
                                    <i className="fas fa-sign-in-alt"></i> Login
                                </Link>
                                <Link to="/register" className={`${styles.navBtn} ${styles.btnRegister}`}>
                                    <i className="fas fa-user-plus"></i> Register
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Persistent Sidebar ── */}
            {!isAuthPage && user && (
                <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}>
                    <nav className={styles.sidebarNav}>
                        {sections.map((section) => (
                            <div key={section.title} className={styles.sidebarSection}>
                                <div className={styles.sectionTitle}>
                                    <span className={styles.sectionTitleText}>{section.title}</span>
                                </div>
                                {section.links.map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className={`${styles.sidebarLink} ${getToneClassName(item.tone)} ${isLinkActive(item.to) ? styles.sidebarLinkActive : ''}`}
                                        title={item.label}
                                    >
                                        <span className={styles.navIconWrapper}>
                                            <i className={`fas ${item.icon}`}></i>
                                            {item.to === '/chat' && totalUnread > 0 && (
                                                <span className={styles.navBadge}>
                                                    {totalUnread > 99 ? '99+' : totalUnread}
                                                </span>
                                            )}
                                        </span>
                                        <span className={styles.linkText}>{item.label}</span>
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </nav>
                </aside>
            )}

            <main className={styles.mainContent} style={isChatPage ? { gridRow: '2 / span 2' } : {}}>
                <Outlet />
            </main>

            {!isChatPage && (
                <footer className={styles.footer}>
                    <div className={styles.footerContent}>
                        <p>&copy; 2025 HKU Intelligent Education Platform. All rights reserved.</p>
                    </div>
                </footer>
            )}
        </div>
    );
}