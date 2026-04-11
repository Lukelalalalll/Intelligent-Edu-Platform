import React, { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import ScrollToTop from './shared/ScrollToTop';
import Layout from './shared/Layout';
import { CourseProvider } from './hooks/useCourseContext';
import ErrorBoundary from './shared/ErrorBoundary';
import RouteErrorBoundary from './shared/RouteErrorBoundary';

import {
  LoginPage, RegisterPage, ForgotPage, ProfilePage,
  HomePage, HomeStudentPage,
  AdminDashboardPage, AdminDbConsolePage, AdminFileCenterPage,
  AIInteractPage, EmailAgentPage,
  MailboxPage, GradingWorkbenchPage,
  KnowledgeBasePage, DiagramPage, QuestionGeneratorPage,
  MdProcessorPage, HighlighterPage, SpecifyPage, QuickProcessPage, PptTemplatePage,
  StudyNotesPage, VideoGenPage,
  ChatPage, DiagnosticFeedbackPage, PublishHomework,
} from './router';

import client from './api/client';


const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    let alive = true;

    const checkSession = async () => {
      const localUser = localStorage.getItem('user');
      if (!localUser) {
        if (alive) {
          setIsAuthed(false);
          setIsChecking(false);
        }
        return;
      }

      const now = Date.now();
      if (now - lastCheckRef.current < SESSION_CHECK_INTERVAL) {
        if (alive) {
          setIsAuthed(true);
          setIsChecking(false);
        }
        return;
      }

      try {
        const res = await client.get('/session');
        if (!alive) return;

        lastCheckRef.current = Date.now();
        const freshUser = res?.data?.user;
        if (freshUser) {
          localStorage.setItem('user', JSON.stringify(freshUser));
        }
        setIsAuthed(true);
      } catch (err) {
        console.error('Session check failed', err);
        if (!alive) return;
        localStorage.removeItem('user');
        setIsAuthed(false);
      } finally {
        if (alive) {
          setIsChecking(false);
        }
      }
    };

    checkSession();

    return () => {
      alive = false;
    };
  }, [location.pathname]);

  if (isChecking) return null;

  if (!isAuthed) {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
};

const PublicRoute = ({ children }: { children: ReactNode }) => {
  const user = localStorage.getItem('user');
  if (user) return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
      <ErrorBoundary>
      <CourseProvider>
      <ScrollToTop />
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<RouteErrorBoundary><ProtectedRoute><HomePage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="home_student" element={<RouteErrorBoundary><ProtectedRoute><HomeStudentPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/md-processor" element={<RouteErrorBoundary><ProtectedRoute><MdProcessorPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="profile" element={<RouteErrorBoundary><ProtectedRoute><ProfilePage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="ai-interaction" element={<RouteErrorBoundary><ProtectedRoute><AIInteractPage /></ProtectedRoute></RouteErrorBoundary>} />

          <Route path="login" element={<RouteErrorBoundary><PublicRoute><LoginPage /></PublicRoute></RouteErrorBoundary>} />
          <Route path="register" element={<RouteErrorBoundary><PublicRoute><RegisterPage /></PublicRoute></RouteErrorBoundary>} />
          <Route path="forgot-password" element={<RouteErrorBoundary><PublicRoute><ForgotPage /></PublicRoute></RouteErrorBoundary>} />

          <Route path="slides/highlighter" element={<RouteErrorBoundary><ProtectedRoute><HighlighterPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/specify" element={<RouteErrorBoundary><ProtectedRoute><SpecifyPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/quick-process" element={<RouteErrorBoundary><ProtectedRoute><QuickProcessPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/ppt-template" element={<RouteErrorBoundary><ProtectedRoute><PptTemplatePage /></ProtectedRoute></RouteErrorBoundary>} />

          <Route path="questions" element={<RouteErrorBoundary><ProtectedRoute><QuestionGeneratorPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="publish-homework" element={<RouteErrorBoundary><ProtectedRoute><PublishHomework /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="admin/dashboard" element={<RouteErrorBoundary><ProtectedRoute><AdminDashboardPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="admin/db-console" element={<RouteErrorBoundary><ProtectedRoute><AdminDbConsolePage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="admin/file-center" element={<RouteErrorBoundary><ProtectedRoute><AdminFileCenterPage /></ProtectedRoute></RouteErrorBoundary>} />

          <Route path="diagram" element={<RouteErrorBoundary><ProtectedRoute><DiagramPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="study-notes" element={<RouteErrorBoundary><ProtectedRoute><StudyNotesPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="knowledge-base" element={<RouteErrorBoundary><ProtectedRoute><KnowledgeBasePage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="diagnostic-feedback" element={<RouteErrorBoundary><ProtectedRoute><DiagnosticFeedbackPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="video-gen" element={<RouteErrorBoundary><ProtectedRoute><VideoGenPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="mailbox" element={<RouteErrorBoundary><ProtectedRoute><MailboxPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="mailbox/grade_workbench/:submissionId" element={<RouteErrorBoundary><ProtectedRoute><GradingWorkbenchPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="email-agent" element={<RouteErrorBoundary><ProtectedRoute><EmailAgentPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="gmail/callback" element={<RouteErrorBoundary><ProtectedRoute><EmailAgentPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="ai-email" element={<Navigate to="/email-agent" replace />} />
          <Route path="chat" element={<RouteErrorBoundary><ProtectedRoute><ChatPage /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="chat/room/:roomId" element={<RouteErrorBoundary><ProtectedRoute><ChatPage /></ProtectedRoute></RouteErrorBoundary>} />
        </Route>
      </Routes>
      </Suspense>
      </CourseProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;