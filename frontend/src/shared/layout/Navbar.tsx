import { Link } from 'react-router-dom';
import logoImg from '../../assets/hku_logo.png';
import type { User } from '../../types/api';
import ThemeToggle from '../components/ThemeToggle/ThemeToggle';
import styles from '../Layout.module.css';

interface NavbarProps {
  user: User | null;
  sidebarOpen: boolean;
  isAuthPage: boolean;
  onToggleSidebar: () => void;
  onLogout: (e: React.MouseEvent) => void;
}

export default function Navbar({ user, sidebarOpen, isAuthPage, onToggleSidebar, onLogout }: NavbarProps) {
  return (
    <header className={styles.navbar}>
      <div className={styles.navContainer}>
        <div className={styles.navLeft}>
          {!isAuthPage && user && (
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={onToggleSidebar}
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

              <button onClick={onLogout} className={styles.btnLogout}>
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
