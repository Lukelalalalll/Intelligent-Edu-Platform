import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import logoImg from '../assets/hku_logo.png';

// 1. 引入全局样式
import '../styles/base.css';
// 2. 引入 Module 样式
import styles from './Layout.module.css';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            setUser(null);
        }
    }, [location]);

    const handleLogout = async (e) => {
        e.preventDefault();
        try {
            await client.post('/logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('user');
            setUser(null);
            navigate('/login');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header className={styles.navbar}>
                <div className={styles.navContainer}>
                    <div className={styles.navLogo}>
                        <Link to="/">
                            <img src={logoImg} alt="HKU Logo" className={styles.logoImg} />
                        </Link>
                    </div>

                    <div className={styles.navMenu}>
                        {user ? (
                            <div className={styles.userProfile}>
                                {user.role === 'admin' && (
                                    <>
                                        <Link to="/admin/dashboard" className={styles.btnAdmin}>
                                            <i className="fas fa-shield-alt"></i> <span>Dashboard</span>
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

            <main>
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