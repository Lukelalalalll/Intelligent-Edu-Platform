import React, { Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './shared/ScrollToTop';
import Layout from './shared/Layout';
import { CourseProvider } from './shared/hooks/useCourseContext';
import { ErrorBoundary } from './shared/ErrorBoundary';
import RouteErrorBoundary from './shared/RouteErrorBoundary';
import ProtectedRoute from './shared/ProtectedRoute';
import { useAuthStore } from './shared/store/useAuthStore';
import { ROUTES, type RouteConfig } from './router/routes';

/** Forces a full remount of children when the given URL param changes. */
function KeyedByParam({ param, children }: { param: string; children: ReactNode }) {
  const location = useLocation();
  const match = location.pathname.match(new RegExp(`/${param}/([^/]+)`));
  return <React.Fragment key={match?.[1]}>{children}</React.Fragment>;
}

const PublicRoute = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to="/" replace />;
  return children;
};

function wrapRoute(route: RouteConfig) {
  const Page = route.Component;

  let element: ReactNode = <Page />;

  if (route.auth === 'protected') {
    element = <ProtectedRoute>{element}</ProtectedRoute>;
  } else if (route.auth === 'public') {
    element = <PublicRoute>{element}</PublicRoute>;
  }

  element = <RouteErrorBoundary>{element}</RouteErrorBoundary>;

  if (route.keyParam) {
    element = <KeyedByParam param={route.keyParam}>{element}</KeyedByParam>;
  }

  return element;
}

const layoutRoutes = ROUTES.filter((r) => !r.fullScreen);
const fullScreenRoutes = ROUTES.filter((r) => r.fullScreen);

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '8px',
            background: '#363636',
            color: '#fff',
          },
        }}
      />
      <ErrorBoundary>
        <CourseProvider>
          <ScrollToTop />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Layout />}>
                {layoutRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={wrapRoute(route)}
                  />
                ))}
                {/* Catch-all: redirect unknown paths under layout to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>

              {/* Full-screen routes — outside <Layout> (no sidebar/navbar) */}
              {fullScreenRoutes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={wrapRoute(route)}
                />
              ))}
            </Routes>
          </Suspense>
        </CourseProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
