import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';
import { PPT_GENERATOR_ROUTE_PATHS } from '@/ppt_generator/routeMeta';

export type AuthMode = 'protected' | 'public' | 'none';

export interface RouteConfig {
  path: string;
  Component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  auth: AuthMode;
  /** Renders outside the shared layout when the page needs the full viewport. */
  fullScreen?: boolean;
  /** URL segment name that forces a route remount when its value changes. */
  keyParam?: string;
}

const PptGeneratorDashboardRoute = lazy(() => import('@/ppt_generator/routes/PptGeneratorDashboardRoute'));
const PptGeneratorTemplatesRoute = lazy(() => import('@/ppt_generator/routes/PptGeneratorTemplatesRoute'));
const PptGeneratorThemeRoute = lazy(() => import('@/ppt_generator/routes/PptGeneratorThemeRoute'));
const toAppRoutePath = (path: string) => path.replace(/^\//, '');

/**
 * Central route registry consumed by AppShell.
 * Each entry declares layout ownership and auth behavior beside the lazy page import.
 */
export const ROUTES: RouteConfig[] = [
  { path: '', Component: lazy(() => import('@/features/home/pages/HomePage')), auth: 'protected' },

  { path: 'login', Component: lazy(() => import('@/features/auth/pages/LoginPage')), auth: 'public' },
  { path: 'register', Component: lazy(() => import('@/features/auth/pages/RegisterPage')), auth: 'public' },
  { path: 'forgot-password', Component: lazy(() => import('@/features/auth/pages/ForgotPage')), auth: 'public' },
  { path: 'profile', Component: lazy(() => import('@/features/auth/pages/ProfilePage')), auth: 'protected' },
  { path: 'cookie-policy', Component: lazy(() => import('@/features/privacy/pages/CookiePolicyPage')), auth: 'none' },

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
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.upload), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorUploadRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.documentsPreview), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorDocumentsPreviewRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.outline), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorOutlineRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.presentation), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorPresentationRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.dashboard), Component: PptGeneratorDashboardRoute, auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.templates), Component: PptGeneratorTemplatesRoute, auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.theme), Component: PptGeneratorThemeRoute, auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.settings), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorSettingsRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.templatePreview), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorTemplatePreviewRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.customTemplate), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorCustomTemplateRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.pdfMaker), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorPdfMakerRoute }))), auth: 'none', fullScreen: true },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyWorkspace), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorLegacyRedirectRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyQuickProcess), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorLegacyRedirectRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyUpload), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorUploadRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyDocumentsPreview), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorDocumentsPreviewRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyOutline), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorOutlineRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyPresentation), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorPresentationRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyDashboard), Component: PptGeneratorDashboardRoute, auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyTemplates), Component: PptGeneratorTemplatesRoute, auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyTheme), Component: PptGeneratorThemeRoute, auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacySettings), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorSettingsRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyTemplatePreview), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorTemplatePreviewRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyCustomTemplate), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorCustomTemplateRoute }))), auth: 'protected' },
  { path: toAppRoutePath(PPT_GENERATOR_ROUTE_PATHS.legacyPdfMaker), Component: lazy(() => import('@/ppt_generator/routes').then((module) => ({ default: module.PptGeneratorPdfMakerRoute }))), auth: 'none', fullScreen: true },
  { path: 'slides/quick-process', Component: lazy(() => import('@/features/slides/pages/QuickProcess/QuickProcessPage')), auth: 'protected' },
  { path: 'slides/generate-workbench', Component: lazy(() => import('@/features/slides/pages/GenerateWorkbench/GenerateWorkbenchPage')), auth: 'protected' },
  { path: 'slides/ppt-template', Component: lazy(() => import('@/features/slides/pages/PptTemplate/PptTemplatePage')), auth: 'protected' },
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
