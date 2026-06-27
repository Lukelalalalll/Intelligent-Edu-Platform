import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';

export type AuthMode = 'protected' | 'public' | 'none';

export interface RouteConfig {
  path: string;
  Component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  auth: AuthMode;
  fullScreen?: boolean;
  keyParam?: string;
}

const PresentonDashboardRoute = lazy(() => import('@/presenton/routes/PresentonDashboardRoute'));
const PresentonTemplatesRoute = lazy(() => import('@/presenton/routes/PresentonTemplatesRoute'));
const PresentonThemeRoute = lazy(() => import('@/presenton/routes/PresentonThemeRoute'));

export const ROUTES: RouteConfig[] = [
  { path: '', Component: lazy(() => import('@/features/home/pages/HomePage')), auth: 'protected' },

  { path: 'login', Component: lazy(() => import('@/features/auth/pages/LoginPage')), auth: 'public' },
  { path: 'register', Component: lazy(() => import('@/features/auth/pages/RegisterPage')), auth: 'public' },
  { path: 'forgot-password', Component: lazy(() => import('@/features/auth/pages/ForgotPage')), auth: 'public' },
  { path: 'profile', Component: lazy(() => import('@/features/auth/pages/ProfilePage')), auth: 'protected' },

  { path: 'home_student', Component: lazy(() => import('@/features/study-room/pages/HomeStudentPage')), auth: 'protected' },

  { path: 'admin/dashboard', Component: lazy(() => import('@/features/admin').then((module) => ({ default: module.AdminDashboardPage }))), auth: 'protected' },
  { path: 'admin/security', Component: lazy(() => import('@/features/admin/pages/AdminSecurityPage')), auth: 'protected' },
  { path: 'admin/db-console', Component: lazy(() => import('@/features/admin/pages/AdminDbConsolePage')), auth: 'protected' },
  { path: 'admin/file-center', Component: lazy(() => import('@/features/admin-file-center').then((module) => ({ default: module.AdminFileCenterPage }))), auth: 'protected' },
  { path: 'admin/rag-evaluator', Component: lazy(() => import('@/features/rag-evaluator').then((module) => ({ default: module.RagEvaluatorPage }))), auth: 'protected' },

  { path: 'ai-interaction', Component: lazy(() => import('@/features/ai-interact').then((module) => ({ default: module.AIInteractPage }))), auth: 'protected' },
  { path: 'ai-config', Component: lazy(() => import('@/features/ai-config').then((module) => ({ default: module.AIConfigPage }))), auth: 'protected' },
  { path: 'chat', Component: lazy(() => import('@/features/chat/pages/ChatPage')), auth: 'protected' },
  { path: 'chat/room/:roomId', Component: lazy(() => import('@/features/chat/pages/ChatPage')), auth: 'protected' },

  { path: 'slides/highlighter', Component: lazy(() => import('@/features/slides/pages/Highlighter/HighlighterPage')), auth: 'protected' },
  { path: 'slides/specify', Component: lazy(() => import('@/features/slides/pages/Specify/SpecifyPage')), auth: 'protected' },
  { path: 'slides/presenton', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonUploadRoute }))), auth: 'protected' },
  { path: 'slides/presenton/documents-preview', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonDocumentsPreviewRoute }))), auth: 'protected' },
  { path: 'slides/presenton/outline', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonOutlineRoute }))), auth: 'protected' },
  { path: 'slides/presenton/presentation', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonPresentationRoute }))), auth: 'protected' },
  { path: 'slides/presenton/dashboard', Component: PresentonDashboardRoute, auth: 'protected' },
  { path: 'slides/presenton/templates', Component: PresentonTemplatesRoute, auth: 'protected' },
  { path: 'slides/presenton/theme', Component: PresentonThemeRoute, auth: 'protected' },
  { path: 'slides/presenton/settings', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonSettingsRoute }))), auth: 'protected' },
  { path: 'slides/presenton/template-preview', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonTemplatePreviewRoute }))), auth: 'protected' },
  { path: 'slides/presenton/custom-template', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonCustomTemplateRoute }))), auth: 'protected' },
  { path: 'slides/presenton/pdf-maker', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonPdfMakerRoute }))), auth: 'none', fullScreen: true },
  { path: 'slides/presenton/workspace', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonLegacyRedirectRoute }))), auth: 'protected' },
  { path: 'slides/presenton/quick-process', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonLegacyRedirectRoute }))), auth: 'protected' },
  { path: 'upload', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonUploadRoute }))), auth: 'protected' },
  { path: 'documents-preview', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonDocumentsPreviewRoute }))), auth: 'protected' },
  { path: 'outline', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonOutlineRoute }))), auth: 'protected' },
  { path: 'presentation', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonPresentationRoute }))), auth: 'protected' },
  { path: 'dashboard', Component: PresentonDashboardRoute, auth: 'protected' },
  { path: 'templates', Component: PresentonTemplatesRoute, auth: 'protected' },
  { path: 'theme', Component: PresentonThemeRoute, auth: 'protected' },
  { path: 'settings', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonSettingsRoute }))), auth: 'protected' },
  { path: 'template-preview', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonTemplatePreviewRoute }))), auth: 'protected' },
  { path: 'custom-template', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonCustomTemplateRoute }))), auth: 'protected' },
  { path: 'pdf-maker', Component: lazy(() => import('@/presenton/routes').then((module) => ({ default: module.PresentonPdfMakerRoute }))), auth: 'none', fullScreen: true },
  { path: 'slides/quick-process', Component: lazy(() => import('@/features/slides/pages/QuickProcess/QuickProcessPage')), auth: 'protected' },
  { path: 'slides/generate-workbench', Component: lazy(() => import('@/features/slides/pages/GenerateWorkbench/GenerateWorkbenchPage')), auth: 'protected' },
  { path: 'slides/ppt-template', Component: lazy(() => import('@/features/slides/pages/PptTemplate/PptTemplatePage')), auth: 'protected' },
  { path: 'slides/ai-theme-config', Component: lazy(() => import('@/features/slides/pages/AIThemeConfig/AIThemeConfigPage')), auth: 'protected' },
  { path: 'slides/editor/:sessionId', Component: lazy(() => import('@/features/slides/pages/Editor/SlideEditorPage')), auth: 'protected', fullScreen: true },

  { path: 'diagram', Component: lazy(() => import('@/features/diagram').then((module) => ({ default: module.DiagramPage }))), auth: 'protected' },
  { path: 'questions', Component: lazy(() => import('@/features/question-bank').then((module) => ({ default: module.QuestionGeneratorPage }))), auth: 'protected' },
  { path: 'study-notes', Component: lazy(() => import('@/features/study-notes').then((module) => ({ default: module.StudyNotesPage }))), auth: 'protected' },
  { path: 'knowledge-base', Component: lazy(() => import('@/features/knowledge-base').then((module) => ({ default: module.KnowledgeBasePage }))), auth: 'protected' },
  { path: 'video-gen', Component: lazy(() => import('@/features/video-gen').then((module) => ({ default: module.VideoGenPage }))), auth: 'protected' },
  { path: 'file-center', Component: lazy(() => import('@/features/file-center').then((module) => ({ default: module.FileCenterPage }))), auth: 'protected' },

  { path: 'mailbox', Component: lazy(() => import('@/features/mailbox').then((module) => ({ default: module.MailboxPage }))), auth: 'protected' },
  { path: 'mailbox/grade_workbench/:submissionId', Component: lazy(() => import('@/features/grading').then((module) => ({ default: module.GradingWorkbenchPage }))), auth: 'protected', keyParam: 'grade_workbench' },
  { path: 'publish-homework', Component: lazy(() => import('@/features/homework').then((module) => ({ default: module.PublishHomeworkPage }))), auth: 'protected' },

  { path: 'slide-renderer', Component: lazy(() => import('@/features/video-gen/pages/SlideRendererPage')), auth: 'none', fullScreen: true },
];
