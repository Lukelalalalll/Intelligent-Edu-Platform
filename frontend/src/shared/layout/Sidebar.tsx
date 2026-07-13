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
import { useI18n } from '@/shared/i18n';
import styles from '../Layout.module.css';

interface SidebarProps {
  user: User | null;
  isAuthPage: boolean;
  sidebarOpen: boolean;
  sidebarAnimating: boolean;
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

export default function Sidebar({ user, isAuthPage, sidebarOpen, sidebarAnimating }: SidebarProps) {
  const location = useLocation();
  const { t } = useI18n();
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
              ? { to: '/', labelKey: 'sidebar.teacherView', icon: 'fa-chalkboard-teacher', tone: 'teacher' as const }
              : { to: '/home_student', labelKey: 'sidebar.studentView', icon: 'fa-graduation-cap', tone: 'student' as const },
          ],
        },
      ];
    }
    if (user.role === 'student') return STUDENT_NAV_SECTIONS;
    if (user.role === 'teacher') return TEACHER_NAV_SECTIONS;
    return NAV_SECTIONS;
  })();

  return (
    <aside
      className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}
      data-sidebar-open={sidebarOpen ? 'true' : 'false'}
      data-sidebar-animating={sidebarAnimating ? 'true' : 'false'}
    >
      <div className={styles.sidebarInner}>
        <nav className={styles.sidebarNav}>
          {sections.map((section) => (
            <div key={section.titleKey} className={styles.sidebarSection}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleClip}>
                  <span className={styles.sectionTitleText}>{t(section.titleKey)}</span>
                </span>
              </div>
              {section.links.map((item) => {
                const label = t(item.labelKey);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`${styles.sidebarLink} ${getToneClassName(item.tone)} ${isLinkActive(item.to, location.pathname, location.search) ? styles.sidebarLinkActive : ''}`}
                    title={label}
                  >
                    <span className={styles.navIconWrapper}>
                      <i className={`fas ${item.icon}`}></i>
                      {item.to === '/chat' && totalUnread > 0 && (
                        <span className={styles.navBadge}>
                          {totalUnread > 99 ? '99+' : totalUnread}
                        </span>
                      )}
                    </span>
                    <span className={styles.linkTextClip}>
                      <span className={styles.linkText}>{label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
