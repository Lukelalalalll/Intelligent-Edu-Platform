import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import RouteSkeleton from './RouteSkeleton';
import { useAuthStore } from './store/useAuthStore';

function isPptGeneratorRoute(pathname: string) {
  return (
    pathname.startsWith('/slides/ppt_generator') ||
    [
      '/upload',
      '/documents-preview',
      '/outline',
      '/presentation',
      '/dashboard',
      '/templates',
      '/theme',
      '/settings',
      '/template-preview',
      '/custom-template',
    ].includes(pathname)
  );
}

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);

  if (status === 'unknown' || (isSessionLoading && !user)) {
    return <RouteSkeleton tone={isPptGeneratorRoute(location.pathname) ? 'pptGenerator' : 'default'} />;
  }

  if (!user || status === 'anonymous') {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
};

export default ProtectedRoute;

