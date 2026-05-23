import { Link, useLocation } from 'react-router-dom';
import { useChatStore } from '../../features/chat/store/chatStore';
import type { User } from '../../types/api';
import type { NavSection } from './navigationConfig';
import {
  NAV_SECTIONS,
  STUDENT_NAV_SECTIONS,
  TEACHER_NAV_SECTIONS,
  ADMIN_SECTION,
} from './navigationConfig';
import styles from '../Layout.module.css';

interface SidebarProps {
  user: User | null;
  isAuthPage: boolean;
  sidebarOpen: boolean;
}

function getToneClassName(tone?: string): string {
  if (tone === 'admin') return styles.sidebarLinkToneAdmin;
  if (tone === 'database') return styles.sidebarLinkToneDatabase;
  if (tone === 'teacher') return styles.sidebarLinkToneTeacher;
  if (tone === 'student') return styles.sidebarLinkToneStudent;
  return '';
}

function isLinkActive(to: string, pathname: string, search: string): boolean {
  const currentTab = new URLSearchParams(search).get('tab');
  if (to === '/?tab=tools') return pathname === '/' && currentTab === 'tools';
  if (to === '/') return pathname === '/' && currentTab !== 'tools';
  return pathname === to;
}

export default function Sidebar({ user, isAuthPage, sidebarOpen }: SidebarProps) {
  const location = useLocation();
  const totalUnread = useChatStore((s) =>
    Object.values(s.unreadCounts).reduce((sum, n) => sum + n, 0),
  );

  if (isAuthPage || !user) return null;

  const sections: NavSection[] = (() => {
    if (user.role === 'admin') {
      return [
        ...NAV_SECTIONS,
        {
          ...ADMIN_SECTION,
          links: [
            ...ADMIN_SECTION.links,
            location.pathname === '/home_student'
              ? { to: '/', label: 'Teacher View', icon: 'fa-chalkboard-teacher', tone: 'teacher' as const }
              : { to: '/home_student', label: 'Student View', icon: 'fa-graduation-cap', tone: 'student' as const },
          ],
        },
      ];
    }
    if (user.role === 'student') return STUDENT_NAV_SECTIONS;
    if (user.role === 'teacher') return TEACHER_NAV_SECTIONS;
    return NAV_SECTIONS;
  })();

  return (
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
                className={`${styles.sidebarLink} ${getToneClassName(item.tone)} ${isLinkActive(item.to, location.pathname, location.search) ? styles.sidebarLinkActive : ''}`}
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
  );
}
