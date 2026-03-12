import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomeEntry from './entries/homeEntry';
import MdProcessorEntry from './entries/sub1/mdProcessorEntry';
import LoginEntry from './entries/loginEntry';
import RegisterEntry from './entries/registerEntry';
import ForgotEntry from './entries/forgotEntry';

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
        {/* === 所有页面统一包裹 Layout === */}
        <Route path="/" element={<Layout />}>

          {/* 需要登录的子路由 */}
          <Route index element={<ProtectedRoute><HomeEntry /></ProtectedRoute>} />
          <Route path="sub1/md-processor" element={<ProtectedRoute><MdProcessorEntry /></ProtectedRoute>} />

          {/* 不需要登录的子路由（但依然受 Layout 包裹） */}
          <Route path="login" element={<PublicRoute><LoginEntry /></PublicRoute>} />
          <Route path="register" element={<PublicRoute><RegisterEntry /></PublicRoute>} />
          <Route path="forgot-password" element={<PublicRoute><ForgotEntry /></PublicRoute>} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;