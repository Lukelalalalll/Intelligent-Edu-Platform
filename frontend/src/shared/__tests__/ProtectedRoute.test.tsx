import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProtectedRoute from '../ProtectedRoute';

const { mockNavigate, mockStore, mockLocation } = vi.hoisted(() => {
  const navigate = vi.fn();
  const store = {
    user: null as unknown,
    status: 'unknown' as 'unknown' | 'authenticated' | 'anonymous',
    isSessionLoading: false,
  };
  const location = {
    pathname: '/dashboard',
    search: '',
    hash: '',
  };
  return { mockNavigate: navigate, mockStore: store, mockLocation: location };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to);
      return null;
    },
    useLocation: () => mockLocation,
  };
});

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

const fakeUser = {
  id: '1',
  username: 'alice',
  email: 'alice@example.com',
  role: 'student',
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockStore.user = null;
    mockStore.status = 'unknown';
    mockStore.isSessionLoading = false;
    mockLocation.pathname = '/dashboard';
    mockLocation.search = '';
    mockLocation.hash = '';
    mockNavigate.mockReset();
  });

  it('renders children when user is authenticated', () => {
    mockStore.user = fakeUser;
    mockStore.status = 'authenticated';

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /login when auth status is anonymous', () => {
    mockStore.status = 'anonymous';

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/login?next=%2Fdashboard');
  });

  it('shows the route skeleton while auth state is unknown', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the route skeleton while session is loading and user is empty', () => {
    mockStore.status = 'authenticated';
    mockStore.isSessionLoading = true;

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('uses the Presenton-toned skeleton on Presenton routes while auth state is pending', () => {
    mockLocation.pathname = '/slides/presenton/dashboard';

    const { container } = render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(container.firstChild).toHaveStyle({
      background:
        'radial-gradient(circle at top left, rgba(224, 245, 235, 0.98), rgba(239, 248, 243, 0.99) 34%, rgba(246, 251, 248, 1) 100%)',
    });
  });

  it('keeps rendering children while session refreshes an existing user', () => {
    mockStore.user = fakeUser;
    mockStore.status = 'authenticated';
    mockStore.isSessionLoading = true;

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
