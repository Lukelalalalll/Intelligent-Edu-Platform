import React, { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ScrollToTop from './shared/ScrollToTop';
import Layout from './shared/Layout';
import { CourseProvider } from './hooks/useCourseContext';
import ErrorBoundary from './shared/ErrorBoundary';
import RouteErrorBoundary from './shared/RouteErrorBoundary';

const HomeEntry = React.lazy(() => import('./entries/homeEntry'));
const MdProcessorEntry = React.lazy(() => import('./entries/slides/mdProcessorEntry'));
const LoginEntry = React.lazy(() => import('./entries/loginEntry'));
const RegisterEntry = React.lazy(() => import('./entries/registerEntry'));
const ForgotEntry = React.lazy(() => import('./entries/forgotEntry'));
const ProfileEntry = React.lazy(() => import('./entries/profileEntry'));
const AIInteractEntry = React.lazy(() => import('./entries/aiInteractEntry'));
const HighlighterEntry = React.lazy(() => import('./entries/slides/highlighterEntry'));
const AdminDashboardEntry = React.lazy(() => import('./entries/adminDashboardEntry'));
const AdminDbConsoleEntry = React.lazy(() => import('./entries/adminDbConsoleEntry'));
const AdminFileCenterEntry = React.lazy(() => import('./entries/adminFileCenterEntry'));
const DiagramToolEntry = React.lazy(() => import('./entries/diagram/diagramToolEntry'));
const QuestionGeneratorEntry = React.lazy(() => import('./entries/question-bank/questionGeneratorEntry'));
const QuickProcessEntry = React.lazy(() => import('./entries/slides/quickProcessEntry'));
const SpecifyEntry = React.lazy(() => import('./entries/slides/specifyEntry'));
const PptTemplateEntry = React.lazy(() => import('./entries/slides/pptTemplateEntry'));
const HomeStudentEntry = React.lazy(() => import('./entries/homeStudentEntry'));
const MailboxEntry = React.lazy(() => import('./entries/mailboxEntry'));
const GradingWorkbenchEntry = React.lazy(() => import('./entries/gradingWorkbenchEntry'));
const EmailAgentEntry = React.lazy(() => import('./entries/emailAgentEntry'));
const StudyNotesEntry = React.lazy(() => import('./entries/study-notes/studyNotesEntry'));
const ChatEntry = React.lazy(() => import('./entries/chatEntry'));
const KnowledgeBaseEntry = React.lazy(() => import('./entries/knowledgeBaseEntry'));

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
      <ErrorBoundary>
      <CourseProvider>
      <ScrollToTop />
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<RouteErrorBoundary><ProtectedRoute><HomeEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="home_student" element={<RouteErrorBoundary><ProtectedRoute><HomeStudentEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/md-processor" element={<RouteErrorBoundary><ProtectedRoute><MdProcessorEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="profile" element={<RouteErrorBoundary><ProtectedRoute><ProfileEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="ai-interaction" element={<RouteErrorBoundary><ProtectedRoute><AIInteractEntry /></ProtectedRoute></RouteErrorBoundary>} />

          <Route path="login" element={<RouteErrorBoundary><PublicRoute><LoginEntry /></PublicRoute></RouteErrorBoundary>} />
          <Route path="register" element={<RouteErrorBoundary><PublicRoute><RegisterEntry /></PublicRoute></RouteErrorBoundary>} />
          <Route path="forgot-password" element={<RouteErrorBoundary><PublicRoute><ForgotEntry /></PublicRoute></RouteErrorBoundary>} />

          <Route path="slides/highlighter" element={<RouteErrorBoundary><ProtectedRoute><HighlighterEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/specify" element={<RouteErrorBoundary><ProtectedRoute><SpecifyEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/quick-process" element={<RouteErrorBoundary><ProtectedRoute><QuickProcessEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="slides/ppt-template" element={<RouteErrorBoundary><ProtectedRoute><PptTemplateEntry /></ProtectedRoute></RouteErrorBoundary>} />

          <Route path="questions" element={<RouteErrorBoundary><ProtectedRoute><QuestionGeneratorEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="admin/dashboard" element={<RouteErrorBoundary><ProtectedRoute><AdminDashboardEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="admin/db-console" element={<RouteErrorBoundary><ProtectedRoute><AdminDbConsoleEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="admin/file-center" element={<RouteErrorBoundary><ProtectedRoute><AdminFileCenterEntry /></ProtectedRoute></RouteErrorBoundary>} />

          <Route path="diagram" element={<RouteErrorBoundary><ProtectedRoute><DiagramToolEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="study-notes" element={<RouteErrorBoundary><ProtectedRoute><StudyNotesEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="knowledge-base" element={<RouteErrorBoundary><ProtectedRoute><KnowledgeBaseEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="mailbox" element={<RouteErrorBoundary><ProtectedRoute><MailboxEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="mailbox/grade_workbench/:submissionId" element={<RouteErrorBoundary><ProtectedRoute><GradingWorkbenchEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="email-agent" element={<RouteErrorBoundary><ProtectedRoute><EmailAgentEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="gmail/callback" element={<RouteErrorBoundary><ProtectedRoute><EmailAgentEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="ai-email" element={<Navigate to="/email-agent" replace />} />
          <Route path="chat" element={<RouteErrorBoundary><ProtectedRoute><ChatEntry /></ProtectedRoute></RouteErrorBoundary>} />
          <Route path="chat/room/:roomId" element={<RouteErrorBoundary><ProtectedRoute><ChatEntry /></ProtectedRoute></RouteErrorBoundary>} />
        </Route>
      </Routes>
      </Suspense>
      </CourseProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;