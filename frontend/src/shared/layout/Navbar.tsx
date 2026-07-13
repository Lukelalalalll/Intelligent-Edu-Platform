import React from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../../assets/hku_logo.png';
import type { User } from '../../types/api';
import LanguageSwitcher from '../components/LanguageSwitcher/LanguageSwitcher';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import { useI18n } from '@/shared/i18n';
import styles from '../Layout.module.css';

interface NavbarProps {
  user: User | null;
  sidebarOpen: boolean;
  isAuthPage: boolean;
  isAuthPending: boolean;
  onToggleSidebar: () => void;
  onLogout: (e: React.MouseEvent) => void;
}

export default function Navbar({ user, sidebarOpen, isAuthPage, isAuthPending, onToggleSidebar, onLogout }: NavbarProps) {
  const { t } = useI18n();

  return (
    <header className={styles.navbar}>
      <div className={styles.navContainer}>
        <div className={styles.navLeft}>
          {!isAuthPage && user && (
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={onToggleSidebar}
              aria-label={t('nav.toggleSidebar')}
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
              <span className={styles.welcomeText}>{t('nav.hi')}, <strong>{user.username}</strong></span>

              <Link to="/profile" className={styles.btnProfile}>
                <i className="fas fa-user-circle"></i> <span>{t('nav.profile')}</span>
              </Link>

              <button onClick={onLogout} className={styles.btnLogout}>
                <i className="fas fa-sign-out-alt"></i> <span>{t('nav.logout')}</span>
              </button>
            </div>
          ) : !isAuthPending ? (
            <>
              <Link to="/login" className={`${styles.navBtn} ${styles.btnLogin}`}>
                <i className="fas fa-sign-in-alt"></i> {t('nav.login')}
              </Link>
              <Link to="/register" className={`${styles.navBtn} ${styles.btnRegister}`}>
                <i className="fas fa-user-plus"></i> {t('nav.register')}
              </Link>
            </>
          ) : null}
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
