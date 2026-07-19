import React, { Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './shared/ScrollToTop';
import Layout from './shared/Layout';
import { ErrorBoundary } from './shared/ErrorBoundary';
import RouteErrorBoundary from './shared/RouteErrorBoundary';
import ProtectedRoute from './shared/ProtectedRoute';
import { shouldBypassAuthBootstrap, useAuthBootstrap } from './shared/hooks/useAuthBootstrap';
import { useAuthStore } from './shared/store/useAuthStore';
import { ROUTES, type RouteConfig } from './router/routes';
import RouteSkeleton from './shared/RouteSkeleton';
import { isPptGeneratorRoutePath } from './ppt_generator/routeMeta';

/** Forces a full remount of children when the given URL param changes. */
function KeyedByParam({ param, children }: { param: string; children: ReactNode }) {
  const location = useLocation();
  const match = location.pathname.match(new RegExp(`/${param}/([^/]+)`));
  return <React.Fragment key={match?.[1]}>{children}</React.Fragment>;
}

const PublicRoute = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);

  if (status === 'unknown' || (isSessionLoading && !user)) {
    return <RouteSkeleton />;
  }

  if (user) {
    const defaultPath = user.role === 'student' ? '/home_student' : '/';
    return <Navigate to={defaultPath} replace />;
  }

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

/** Routes rendered inside the shared app shell keep the sidebar and top-level layout. */
const layoutRoutes = ROUTES.filter((r) => !r.fullScreen);

/** Full-screen routes opt out of layout chrome for editors, renderers, and exports. */
const fullScreenRoutes = ROUTES.filter((r) => r.fullScreen);

/** Bootstraps session state and renders the route tree for the current location. */
function AppShell() {
  const location = useLocation();
  useAuthBootstrap({ enabled: !shouldBypassAuthBootstrap(location.pathname) });
  const suspenseTone = isPptGeneratorRoutePath(location.pathname) ? 'pptGenerator' : 'default';

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '8px',
            background: 'var(--toast-bg)',
            color: 'var(--toast-color)',
            border: '1px solid var(--toast-border)',
            boxShadow: 'var(--shadow-md)',
          },
        }}
      />
      <ErrorBoundary>
        <ScrollToTop />
        <Suspense fallback={<RouteSkeleton tone={suspenseTone} />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              {layoutRoutes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={wrapRoute(route)}
                />
              ))}
              {/* Keep unknown in-layout routes inside the authenticated shell. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* Full-screen routes render outside <Layout> so canvas-like tools own the viewport. */}
            {fullScreenRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={wrapRoute(route)}
              />
            ))}
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

/** Mounts global providers that must wrap all feature routes. */
function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
