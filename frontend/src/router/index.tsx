import React from 'react';

// ── Auth pages ──
export const LoginPage = React.lazy(() => import('../features/auth/pages/LoginPage'));
export const RegisterPage = React.lazy(() => import('../features/auth/pages/RegisterPage'));
export const ForgotPage = React.lazy(() => import('../features/auth/pages/ForgotPage'));
export const ProfilePage = React.lazy(() => import('../features/auth/pages/ProfilePage'));

// ── Home / Study-room pages ──
export const HomePage = React.lazy(() => import('../features/home/pages/HomePage'));
export const HomeStudentPage = React.lazy(() => import('../features/study-room/pages/HomeStudentPage'));

// ── Admin pages ──
export const AdminDashboardPage = React.lazy(() => import('../features/admin/pages/AdminDashboardPage'));
export const AdminDbConsolePage = React.lazy(() => import('../features/admin/pages/AdminDbConsolePage'));
export const AdminFileCenterPage = React.lazy(() => import('../features/admin-file-center/pages/AdminFileCenterPage'));

// ── AI / Email pages ──
export const AIInteractPage = React.lazy(() => import('../features/ai-interact/pages/AIInteractPage'));
export const EmailAgentPage = React.lazy(() => import('../features/email-agent/pages/EmailAgentPage'));

// ── Mailbox / Grading ──
export const MailboxPage = React.lazy(() => import('../features/mailbox/pages/MailboxPage'));
export const GradingWorkbenchPage = React.lazy(() => import('../features/grading/pages/GradingWorkbenchPage'));

// ── Knowledge-base / Diagram / Image / Questions ──
export const KnowledgeBasePage = React.lazy(() => import('../features/knowledge-base/pages/KnowledgeBasePage'));
export const DiagramPage = React.lazy(() => import('../features/diagram/pages/DiagramPage'));
export const ImageExtractorPage = React.lazy(() => import('../features/image-extractor/pages/ImageExtractorPage'));
export const QuestionGeneratorPage = React.lazy(() => import('../features/question-bank/pages/QuestionGeneratorPage'));

// ── Slides pages ──
export const MdProcessorPage = React.lazy(() => import('../features/slides/pages/MdProcessor'));
export const HighlighterPage = React.lazy(() => import('../features/slides/pages/HighlighterPage'));
export const SpecifyPage = React.lazy(() => import('../features/slides/pages/Specify'));
export const QuickProcessPage = React.lazy(() => import('../features/slides/pages/QuickProcess'));
export const PptTemplatePage = React.lazy(() => import('../features/slides/pages/PptTemplate/PptTemplatePage'));

// ── Study-notes / Video-gen ──
export const StudyNotesPage = React.lazy(() => import('../features/study-notes/pages/StudyNotesPage'));
export const VideoGenPage = React.lazy(() => import('../features/video-gen/pages/VideoGenPage'));

// ── Simple pass-through pages (no entry wrapper needed) ──
export const ChatPage = React.lazy(() => import('../features/chat/pages/ChatPage'));
export const DiagnosticFeedbackPage = React.lazy(() => import('../features/diagnostic-feedback/DiagnosticFeedbackPage'));
export const PublishHomework = React.lazy(() => import('../features/homework/PublishHomework'));
