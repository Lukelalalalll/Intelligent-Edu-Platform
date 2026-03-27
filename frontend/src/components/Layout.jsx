import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import logoImg from '../assets/hku_logo.png';
import { log } from '../utils/logger';

// 1. 引入全局样式
import '../styles/base.css';
// 2. 引入 Module 样式
import styles from './Layout.module.css';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
    const hideWorkflowToggle = ['/login', '/register', '/forgot-password'].includes(location.pathname);

    const workflowLinks = [
        { to: '/', label: 'Home' },
        { to: '/home_student', label: 'Home Student' },
        { to: '/ai-interaction', label: 'AI Fullscreen Workspace' },
        { to: '/email-agent', label: 'AI Email' },
        { to: '/?tab=tools', label: 'Tools Workspace' },
    ];

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            setUser(null);
        }
        setWorkflowMenuOpen(false);
    }, [location]);

    const handleLogout = async (e) => {
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

    return (
        <div className={styles.appShell}>
            <header className={styles.navbar}>
                <div className={styles.navContainer}>
                    <div className={styles.navLeft}>
                        {!hideWorkflowToggle && (
                            <button
                                type="button"
                                className={styles.workflowToggle}
                                onClick={() => setWorkflowMenuOpen((prev) => !prev)}
                                aria-label="Toggle workflow menu"
                                aria-expanded={workflowMenuOpen}
                            >
                                <span></span>
                                <span></span>
                            </button>
                        )}

                        <div className={styles.navLogo}>
                            <Link to="/">
                                <img src={logoImg} alt="HKU Logo" className={styles.logoImg} />
                            </Link>
                        </div>
                    </div>

                    <div className={styles.navMenu}>
                        {user ? (
                            <div className={styles.userProfile}>
                                {user.role === 'admin' && (
                                    <>
                                        <Link to="/admin/dashboard" className={styles.btnAdmin}>
                                            <i className="fas fa-shield-alt"></i> <span>Dashboard</span>
                                        </Link>
                                        <Link to="/admin/db-console" className={styles.btnDatabase}>
                                            <i className="fas fa-database"></i> <span>Database</span>
                                        </Link>

                                        {location.pathname === '/home_student' ? (
                                            <Link to="/" className={styles.btnTeachView}>
                                                <i className="fas fa-chalkboard-teacher"></i> <span>Teacher View</span>
                                            </Link>
                                        ) : (
                                            <Link to="/home_student" className={styles.btnStudentView}>
                                                <i className="fas fa-graduation-cap"></i> <span>Student View</span>
                                            </Link>
                                        )}
                                    </>
                                )}

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

            {!hideWorkflowToggle && (
                <>
                    <div
                        className={`${styles.workflowOverlay} ${workflowMenuOpen ? styles.workflowOverlayActive : ''}`}
                        onClick={() => setWorkflowMenuOpen(false)}
                    ></div>

                    <aside className={`${styles.workflowDrawer} ${workflowMenuOpen ? styles.workflowDrawerOpen : ''}`}>
                        <div className={styles.workflowHeader}>
                            <h3>Workflow Services</h3>
                            <button
                                type="button"
                                className={styles.workflowClose}
                                onClick={() => setWorkflowMenuOpen(false)}
                                aria-label="Close workflow menu"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <nav className={styles.workflowNav}>
                            {workflowLinks.map((item) => {
                                const currentTab = new URLSearchParams(location.search).get('tab');
                                const isToolsLink = item.to === '/?tab=tools';
                                const isHomeLink = item.to === '/';
                                const isActive = isToolsLink
                                    ? location.pathname === '/' && currentTab === 'tools'
                                    : isHomeLink
                                        ? location.pathname === '/' && currentTab !== 'tools'
                                        : location.pathname === item.to;

                                return (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className={`${styles.workflowLink} ${isActive ? styles.workflowLinkActive : ''}`}
                                        onClick={() => setWorkflowMenuOpen(false)}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    </aside>
                </>
            )}

            <main className={styles.mainContent}>
                <Outlet />
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <p>&copy; 2025 HKU Intelligent Education Platform. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}