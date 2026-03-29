import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import Layout from './components/Layout';
import { CourseProvider } from './hooks/useCourseContext';
import HomeEntry from './entries/homeEntry';
import MdProcessorEntry from './entries/sub1/mdProcessorEntry';
import LoginEntry from './entries/loginEntry';
import RegisterEntry from './entries/registerEntry';
import ForgotEntry from './entries/forgotEntry';
import ProfileEntry from "./entries/profileEntry.jsx";
import AIInteractEntry from './entries/aiInteractEntry';
import HighlighterEntry from './entries/sub1/highlighterEntry';
import AdminDashboardEntry from './entries/adminDashboardEntry';
import AdminDbConsoleEntry from './entries/adminDbConsoleEntry';
import DiagramToolEntry from './entries/sub4/diagramToolEntry';
import QuestionGeneratorEntry from './entries/sub2/questionGeneratorEntry';
import QuickProcessEntry from './entries/sub1/quickProcessEntry';
import SpecifyEntry from './entries/sub1/specifyEntry';
import PptTemplateEntry from './entries/sub1/pptTemplateEntry';
import HomeStudentEntry from './entries/homeStudentEntry';
import MailboxEntry from './entries/mailboxEntry';
import GradingWorkbenchEntry from './entries/gradingWorkbenchEntry';
import EmailAgentEntry from './entries/emailAgentEntry';
import StudyNotesEntry from './entries/sub5/studyNotesEntry';
import client from './api/client';


const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

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

      try {
        const res = await client.get('/session');
        if (!alive) return;

        const freshUser = res?.data?.user;
        if (freshUser) {
          localStorage.setItem('user', JSON.stringify(freshUser));
        }
        setIsAuthed(true);
      } catch (_) {
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

const PublicRoute = ({ children }) => {
  const user = localStorage.getItem('user');
  if (user) return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <CourseProvider>
      <ScrollToTop />
      <Routes>
        {/* 所有页面都继承 Layout (导航栏) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<ProtectedRoute><HomeEntry /></ProtectedRoute>} />
          <Route path="home_student" element={<ProtectedRoute><HomeStudentEntry /></ProtectedRoute>} />
          <Route path="sub1/md-processor" element={<ProtectedRoute><MdProcessorEntry /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><ProfileEntry /></ProtectedRoute>} />

          {/* AI 页面现在就在这里，它会显示导航栏 */}
          <Route path="ai-interaction" element={<ProtectedRoute><AIInteractEntry /></ProtectedRoute>} />

          <Route path="login" element={<PublicRoute><LoginEntry /></PublicRoute>} />
          <Route path="register" element={<PublicRoute><RegisterEntry /></PublicRoute>} />
          <Route path="forgot-password" element={<PublicRoute><ForgotEntry /></PublicRoute>} />

          <Route path="sub1/highlighter" element={<ProtectedRoute><HighlighterEntry /></ProtectedRoute>} />
          <Route path="sub1/specify" element={<ProtectedRoute><SpecifyEntry /></ProtectedRoute>} />
          <Route path="sub1/quick-process" element={<ProtectedRoute><QuickProcessEntry /></ProtectedRoute>} />
          <Route path="sub1/ppt-template" element={<ProtectedRoute><PptTemplateEntry /></ProtectedRoute>} />

          <Route path="sub3" element={<Navigate to="/sub4" replace />} />
          <Route path="sub2" element={<ProtectedRoute><QuestionGeneratorEntry /></ProtectedRoute>} />
          <Route path="admin/dashboard" element={<ProtectedRoute><AdminDashboardEntry /></ProtectedRoute>} />
          <Route path="admin/db-console" element={<ProtectedRoute><AdminDbConsoleEntry /></ProtectedRoute>} />

          <Route path="sub4" element={<ProtectedRoute><DiagramToolEntry /></ProtectedRoute>} />
          <Route path="sub5" element={<ProtectedRoute><StudyNotesEntry /></ProtectedRoute>} />
          <Route path="home-student" element={<ProtectedRoute><HomeStudentEntry /></ProtectedRoute>} />
          <Route path="mailbox" element={<ProtectedRoute><MailboxEntry /></ProtectedRoute>} />
          <Route path="mailbox/grade_workbench/:submissionId" element={<ProtectedRoute><GradingWorkbenchEntry /></ProtectedRoute>} />
          <Route path="email-agent" element={<ProtectedRoute><EmailAgentEntry /></ProtectedRoute>} />
          <Route path="gmail/callback" element={<ProtectedRoute><EmailAgentEntry /></ProtectedRoute>} />
          <Route path="ai-email" element={<Navigate to="/email-agent" replace />} />

        </Route>
      </Routes>
      </CourseProvider>
    </BrowserRouter>
  );
}

export default App;