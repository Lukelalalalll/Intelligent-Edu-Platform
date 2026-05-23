interface NavLink {
  to: string;
  label: string;
  icon: string;
  tone?: string;
}

export interface NavSection {
  title: string;
  links: NavLink[];
}

export const NAV_SECTIONS: NavSection[] = [
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
      { to: '/file-center', label: 'File Center', icon: 'fa-folder-open' },
    ],
  },
];

export const STUDENT_NAV_SECTIONS: NavSection[] = [
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
      { to: '/file-center', label: 'File Center', icon: 'fa-folder-open' },
    ],
  },
];

export const TEACHER_NAV_SECTIONS: NavSection[] = [
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
      { to: '/file-center', label: 'File Center', icon: 'fa-folder-open' },
    ],
  },
];

export const ADMIN_SECTION: NavSection = {
  title: 'Admin',
  links: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: 'fa-shield-alt', tone: 'admin' },
    { to: '/admin/file-center', label: 'File Center', icon: 'fa-folder-tree', tone: 'admin' },
    { to: '/admin/db-console', label: 'Database', icon: 'fa-database', tone: 'database' },
    { to: '/admin/rag-evaluator', label: 'RAG Evaluator', icon: 'fa-flask', tone: 'admin' },
  ],
};
