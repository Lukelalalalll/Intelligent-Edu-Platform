import type { TranslationKey } from '@/shared/i18n';

interface NavLink {
  to: string;
  labelKey: TranslationKey;
  icon: string;
  tone?: string;
}

export interface NavSection {
  titleKey: TranslationKey;
  links: NavLink[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'sidebar.section.main',
    links: [
      { to: '/', labelKey: 'sidebar.home', icon: 'fa-home' },
      { to: '/home_student', labelKey: 'sidebar.studentView', icon: 'fa-graduation-cap' },
      { to: '/chat', labelKey: 'sidebar.chat', icon: 'fa-comments' },
    ],
  },
  {
    titleKey: 'sidebar.section.aiTools',
    links: [
      { to: '/ai-interaction', labelKey: 'sidebar.aiWorkspace', icon: 'fa-robot' },
      { to: '/ai-config', labelKey: 'sidebar.aiConfig', icon: 'fa-sliders-h' },
      { to: '/knowledge-base', labelKey: 'sidebar.knowledgeBase', icon: 'fa-database' },
    ],
  },
  {
    titleKey: 'sidebar.section.workflow',
    links: [
      { to: '/?tab=tools', labelKey: 'sidebar.tools', icon: 'fa-toolbox' },
      { to: '/mailbox', labelKey: 'sidebar.mailbox', icon: 'fa-inbox' },
      { to: '/file-center', labelKey: 'sidebar.fileCenter', icon: 'fa-folder-open' },
    ],
  },
];

export const STUDENT_NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'sidebar.section.main',
    links: [
      { to: '/home_student', labelKey: 'sidebar.home', icon: 'fa-home' },
      { to: '/chat', labelKey: 'sidebar.chat', icon: 'fa-comments' },
    ],
  },
  {
    titleKey: 'sidebar.section.aiTools',
    links: [
      { to: '/ai-interaction', labelKey: 'sidebar.aiWorkspace', icon: 'fa-robot' },
      { to: '/ai-config', labelKey: 'sidebar.aiConfig', icon: 'fa-sliders-h' },
      { to: '/file-center', labelKey: 'sidebar.fileCenter', icon: 'fa-folder-open' },
    ],
  },
];

export const TEACHER_NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'sidebar.section.main',
    links: [
      { to: '/', labelKey: 'sidebar.home', icon: 'fa-home' },
      { to: '/chat', labelKey: 'sidebar.chat', icon: 'fa-comments' },
    ],
  },
  {
    titleKey: 'sidebar.section.aiTools',
    links: [
      { to: '/ai-interaction', labelKey: 'sidebar.aiWorkspace', icon: 'fa-robot' },
      { to: '/ai-config', labelKey: 'sidebar.aiConfig', icon: 'fa-sliders-h' },
      { to: '/knowledge-base', labelKey: 'sidebar.knowledgeBase', icon: 'fa-database' },
    ],
  },
  {
    titleKey: 'sidebar.section.workflow',
    links: [
      { to: '/?tab=tools', labelKey: 'sidebar.tools', icon: 'fa-toolbox' },
      { to: '/mailbox', labelKey: 'sidebar.mailbox', icon: 'fa-inbox' },
      { to: '/file-center', labelKey: 'sidebar.fileCenter', icon: 'fa-folder-open' },
    ],
  },
];

export const ADMIN_SECTION: NavSection = {
  titleKey: 'sidebar.section.admin',
  links: [
    { to: '/admin/dashboard', labelKey: 'sidebar.dashboard', icon: 'fa-shield-alt', tone: 'admin' },
    { to: '/admin/security', labelKey: 'sidebar.security', icon: 'fa-user-shield', tone: 'admin' },
    { to: '/admin/file-center', labelKey: 'sidebar.fileCenter', icon: 'fa-folder-tree', tone: 'admin' },
    { to: '/admin/db-console', labelKey: 'sidebar.database', icon: 'fa-database', tone: 'database' },
    { to: '/admin/rag-evaluator', labelKey: 'sidebar.ragEvaluator', icon: 'fa-flask', tone: 'admin' },
  ],
};
