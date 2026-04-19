import React from 'react';

// ── Auth pages ──
export const LoginPage = React.lazy(() => import('../features/auth/pages/LoginPage'));
export const RegisterPage = React.lazy(() => import('../features/auth/pages/RegisterPage'));
export const ForgotPage = React.lazy(() => import('../features/auth/pages/ForgotPage'));
export const ProfilePage = React.lazy(() => import('../features/auth/pages/ProfilePage'));

// ── Home / Study-room pages ──
export const HomePage = React.lazy(() => import('../features/home/components/Home'));
export const HomeStudentPage = React.lazy(() => import('../features/study-room/components/HomeStudent'));

// ── Admin pages ──
export const AdminDashboardPage = React.lazy(() => import('../features/admin/pages/AdminDashboardPage'));
export const AdminDbConsolePage = React.lazy(() => import('../features/admin/pages/AdminDbConsolePage'));
export const AdminFileCenterPage = React.lazy(() => import('../features/admin-file-center/pages/AdminFileCenterPage'));
export const RagEvaluatorPage = React.lazy(() => import('../features/rag-evaluator'));

// ── AI pages ──
export const AIInteractPage = React.lazy(() => import('../features/ai-interact/pages/AIInteractPage'));

// ── Mailbox / Grading ──
export const MailboxPage = React.lazy(() => import('../features/mailbox/pages/MailboxPage'));
export const GradingWorkbench = React.lazy(() => import('../features/grading/components/GradingWorkbench'));

// ── Knowledge-base / Diagram / Image / Questions ──
export const KnowledgeBasePage = React.lazy(() => import('../features/knowledge-base/pages/KnowledgeBasePage'));
export const DiagramPage = React.lazy(() => import('../features/diagram/pages/DiagramPage'));
export const ImageExtractorPage = React.lazy(() => import('../features/image-extractor/pages/ImageExtractorPage'));
export const QuestionGeneratorPage = React.lazy(() => import('../features/question-bank/pages/QuestionGeneratorPage'));

// ── Slides pages ──
export const MdProcessorPage = React.lazy(() => import('../features/slides/pages/MdProcessor'));
export const HighlighterPage = React.lazy(() => import('../features/slides/pages/Highlighter'));
export const SpecifyPage = React.lazy(() => import('../features/slides/pages/Specify'));
export const QuickProcessPage = React.lazy(() => import('../features/slides/pages/QuickProcess'));
export const PptTemplatePage = React.lazy(() => import('../features/slides/pages/PptTemplate'));
export const SlideEditorPage = React.lazy(() => import('../features/slides/pages/Editor'));

// ── Study-notes / Video-gen ──
export const StudyNotesPage = React.lazy(() => import('../features/study-notes/pages/StudyNotesPage'));
export const VideoGenPage = React.lazy(() => import('../features/video-gen/pages/VideoGenPage'));

// ── File Center (user-facing) ──
export const FileCenterPage = React.lazy(() => import('../features/file-center/pages/FileCenterPage'));

// ── Simple pass-through pages (no entry wrapper needed) ──
export const ChatPage = React.lazy(() => import('../features/chat/pages/ChatPage'));
export const PublishHomework = React.lazy(() => import('../features/homework/PublishHomework'));
