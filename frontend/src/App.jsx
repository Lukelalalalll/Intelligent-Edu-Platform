import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomeEntry from './entries/homeEntry';
import MdProcessorEntry from './entries/sub1/mdProcessorEntry';
import LoginEntry from './entries/loginEntry';
import RegisterEntry from './entries/registerEntry';
import ForgotEntry from './entries/forgotEntry';
import ProfileEntry from "./entries/profileEntry.jsx";
import AIInteractEntry from './entries/aiInteractEntry';
import HighlighterEntry from './entries/sub1/highlighterEntry';
import AdminDashboardEntry from './entries/adminDashboardEntry';
import DiagramToolEntry from './entries/sub4/diagramToolEntry';


const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem('user');
  if (!user) return <Navigate to="/login" replace />;
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
      <Routes>
        {/* 所有页面都继承 Layout (导航栏) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<ProtectedRoute><HomeEntry /></ProtectedRoute>} />
          <Route path="sub1/md-processor" element={<ProtectedRoute><MdProcessorEntry /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><ProfileEntry /></ProtectedRoute>} />

          {/* AI 页面现在就在这里，它会显示导航栏 */}
          <Route path="ai-interaction" element={<ProtectedRoute><AIInteractEntry /></ProtectedRoute>} />

          <Route path="login" element={<PublicRoute><LoginEntry /></PublicRoute>} />
          <Route path="register" element={<PublicRoute><RegisterEntry /></PublicRoute>} />
          <Route path="forgot-password" element={<PublicRoute><ForgotEntry /></PublicRoute>} />

          <Route path="sub1/highlighter" element={<ProtectedRoute><HighlighterEntry /></ProtectedRoute>} />
          <Route path="admin/dashboard" element={<ProtectedRoute><AdminDashboardEntry /></ProtectedRoute>} />

          <Route path="sub4" element={<ProtectedRoute><DiagramToolEntry /></ProtectedRoute>} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;