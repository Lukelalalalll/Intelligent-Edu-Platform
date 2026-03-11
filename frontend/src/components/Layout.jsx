import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import logoImg from '../assets/hku_logo.png';
import '../styles/base.css';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    // 每次路由变化时，检查本地存储的用户信息 (判断是否登录)
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            setUser(null);
        }
    }, [location]);

    // 处理登出逻辑
    const handleLogout = async (e) => {
        e.preventDefault();
        try {
            await client.post('/logout'); // 通知后端清空 Cookie
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('user'); // 清空本地状态
            setUser(null);
            navigate('/login');
        }
    };

    return (
        <>
            {/* 全局导航栏 */}
            <header className="navbar">
                <div className="nav-container">
                    {/* Logo */}
                    <div className="nav-logo">
                        <Link to="/">
                            <img src={logoImg} alt="HKU Logo" className="logo-img" />
                        </Link>
                    </div>

                    {/* 菜单区域：根据登录状态变化 */}
                    <div className="nav-menu">
                        {user ? (
                            // --- 已登录状态 ---
                            <div className="user-profile">
                                {/* 管理员专属按钮组 */}
                                {user.is_admin && (
                                    <>
                                        <Link to="/admin/dashboard" className="btn-admin">
                                            <i className="fas fa-shield-alt"></i> <span>Dashboard</span>
                                        </Link>

                                        {/* 根据当前路径切换 Teacher/Student View */}
                                        {location.pathname === '/home_student' ? (
                                            <Link to="/" className="btn-teach-view">
                                                <i className="fas fa-chalkboard-teacher"></i> <span>Teacher View</span>
                                            </Link>
                                        ) : (
                                            <Link to="/home_student" className="btn-student-view">
                                                <i className="fas fa-graduation-cap"></i> <span>Student View</span>
                                            </Link>
                                        )}
                                    </>
                                )}

                                <span className="welcome-text">Hi, <strong>{user.username}</strong></span>

                                <Link to="/profile" className="btn-profile">
                                    <i className="fas fa-user-circle"></i> <span>Profile</span>
                                </Link>

                                <button onClick={handleLogout} className="nav-btn btn-logout" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <i className="fas fa-sign-out-alt"></i> <span>Logout</span>
                                </button>
                            </div>
                        ) : (
                            // --- 未登录状态 ---
                            <>
                                <Link to="/login" className="nav-btn btn-login">
                                    <i className="fas fa-sign-in-alt"></i> Login
                                </Link>
                                <Link to="/register" className="nav-btn btn-register">
                                    <i className="fas fa-user-plus"></i> Register
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* 主内容区域，等同于 Jinja2 的 {% block content %}{% endblock %} */}
            <main>
                <Outlet />
            </main>

            {/* 页脚 */}
            <footer className="footer">
                <div className="footer-content">
                    <p>&copy; 2025 HKU Intelligent Education Platform. All rights reserved.</p>
                </div>
            </footer>
        </>
    );
}