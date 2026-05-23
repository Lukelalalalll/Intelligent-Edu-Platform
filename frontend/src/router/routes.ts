import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';

export type AuthMode = 'protected' | 'public' | 'none';

export interface RouteConfig {
  path: string;
  Component: LazyExoticComponent<ComponentType<any>>;
  auth: AuthMode;
  /** If true, the route renders outside the main <Layout> (no sidebar/navbar). */
  fullScreen?: boolean;
  /** URL param key to force remount on change. */
  keyParam?: string;
}

const asComponent = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> => lazy(factory);

export const ROUTES: RouteConfig[] = [
  // ── Index ──
  { path: '', Component: asComponent(() => import('@/features/home').then(m => ({ default: m.HomePage }))), auth: 'protected' },

  // ── Auth pages ──
  { path: 'login', Component: asComponent(() => import('@/features/auth').then(m => ({ default: m.LoginPage }))), auth: 'public' },
  { path: 'register', Component: asComponent(() => import('@/features/auth').then(m => ({ default: m.RegisterPage }))), auth: 'public' },
  { path: 'forgot-password', Component: asComponent(() => import('@/features/auth').then(m => ({ default: m.ForgotPage }))), auth: 'public' },
  { path: 'profile', Component: asComponent(() => import('@/features/auth').then(m => ({ default: m.ProfilePage }))), auth: 'protected' },

  // ── Dashboard ──
  { path: 'home_student', Component: asComponent(() => import('@/features/study-room').then(m => ({ default: m.HomeStudentPage }))), auth: 'protected' },

  // ── Admin ──
  { path: 'admin/dashboard', Component: asComponent(() => import('@/features/admin').then(m => ({ default: m.AdminDashboardPage }))), auth: 'protected' },
  { path: 'admin/db-console', Component: lazy(() => import('@/features/admin/pages/AdminDbConsolePage')), auth: 'protected' },
  { path: 'admin/file-center', Component: asComponent(() => import('@/features/admin-file-center').then(m => ({ default: m.AdminFileCenterPage }))), auth: 'protected' },
  { path: 'admin/rag-evaluator', Component: asComponent(() => import('@/features/rag-evaluator').then(m => ({ default: m.RagEvaluatorPage }))), auth: 'protected' },

  // ── AI / Chat ──
  { path: 'ai-interaction', Component: asComponent(() => import('@/features/ai-interact').then(m => ({ default: m.AIInteractPage }))), auth: 'protected' },
  { path: 'chat', Component: asComponent(() => import('@/features/chat').then(m => ({ default: m.ChatPage }))), auth: 'protected' },
  { path: 'chat/room/:roomId', Component: asComponent(() => import('@/features/chat').then(m => ({ default: m.ChatPage }))), auth: 'protected' },

  // ── Slides ──
  { path: 'slides/md-processor', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.MdProcessorPage }))), auth: 'protected' },
  { path: 'slides/highlighter', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.HighlighterPage }))), auth: 'protected' },
  { path: 'slides/specify', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.SpecifyPage }))), auth: 'protected' },
  { path: 'slides/quick-process', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.QuickProcessPage }))), auth: 'protected' },
  { path: 'slides/ppt-template', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.PptTemplatePage }))), auth: 'protected' },
  { path: 'slides/ai-theme-config', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.AIThemeConfigPage }))), auth: 'protected' },
  { path: 'slides/editor/:sessionId', Component: asComponent(() => import('@/features/slides').then(m => ({ default: m.SlideEditorPage }))), auth: 'protected', fullScreen: true },

  // ── Tools ──
  { path: 'diagram', Component: asComponent(() => import('@/features/diagram').then(m => ({ default: m.DiagramPage }))), auth: 'protected' },
  { path: 'questions', Component: asComponent(() => import('@/features/question-bank').then(m => ({ default: m.QuestionGeneratorPage }))), auth: 'protected' },
  { path: 'study-notes', Component: asComponent(() => import('@/features/study-notes').then(m => ({ default: m.StudyNotesPage }))), auth: 'protected' },
  { path: 'knowledge-base', Component: asComponent(() => import('@/features/knowledge-base').then(m => ({ default: m.KnowledgeBasePage }))), auth: 'protected' },
  { path: 'video-gen', Component: asComponent(() => import('@/features/video-gen').then(m => ({ default: m.VideoGenPage }))), auth: 'protected' },
  { path: 'file-center', Component: asComponent(() => import('@/features/file-center').then(m => ({ default: m.FileCenterPage }))), auth: 'protected' },

  // ── Mailbox / Grading ──
  { path: 'mailbox', Component: asComponent(() => import('@/features/mailbox').then(m => ({ default: m.MailboxPage }))), auth: 'protected' },
  { path: 'mailbox/grade_workbench/:submissionId', Component: asComponent(() => import('@/features/grading').then(m => ({ default: m.GradingWorkbenchPage }))), auth: 'protected', keyParam: 'grade_workbench' },
  { path: 'publish-homework', Component: asComponent(() => import('@/features/homework').then(m => ({ default: m.PublishHomeworkPage }))), auth: 'protected' },

  // ── Headless renderer (no auth) ──
  { path: 'slide-renderer', Component: lazy(() => import('@/features/video-gen/pages/SlideRendererPage')), auth: 'none', fullScreen: true },
];
