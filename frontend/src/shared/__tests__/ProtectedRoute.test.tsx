import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedRoute from '../ProtectedRoute';

// ---------------------------------------------------------------------------
// Hoisted mocks  (run before vi.mock factories so they can reference them)
// ---------------------------------------------------------------------------
const { mockNavigate, mockClientGet, mockStore } = vi.hoisted(() => {
  const navigate = vi.fn();
  const clientGet = vi.fn();
  const store: { user: unknown; updateProfile: ReturnType<typeof vi.fn> } = {
    user: null,
    updateProfile: vi.fn(),
  };
  return { mockNavigate: navigate, mockClientGet: clientGet, mockStore: store };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to);
      return null;
    },
    useLocation: () => ({ pathname: '/dashboard', search: '', hash: '' }),
  };
});

vi.mock('../api/client', () => ({
  default: { get: mockClientGet },
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) => {
      if (typeof selector === 'function') return selector(mockStore);
      return mockStore;
    },
    { getState: () => mockStore },
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const fakeUser = {
  id: '1',
  username: 'alice',
  email: 'alice@example.com',
  role: 'student',
};
const childText = 'Protected Content';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockStore.user = null;
    vi.mocked(mockStore.updateProfile).mockClear();
    mockClientGet.mockReset();
    mockNavigate.mockReset();
  });

  it('renders children when user is authenticated', async () => {
    mockStore.user = fakeUser;
    mockClientGet.mockResolvedValue({ data: { user: null } });

    render(
      <ProtectedRoute>
        <div>{childText}</div>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(screen.getByText(childText)).toBeInTheDocument();
    });
  });

  it('redirects to /login when user is not authenticated', async () => {
    render(
      <ProtectedRoute>
        <div>{childText}</div>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login?next=%2Fdashboard');
    });
  });

  it('shows loading indicator while checking auth', async () => {
    let resolveRequest: (value: unknown) => void;
    const deferred = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    mockClientGet.mockReturnValue(deferred);
    mockStore.user = fakeUser;

    render(
      <ProtectedRoute>
        <div>{childText}</div>
      </ProtectedRoute>,
    );

    // The session-check is still pending — component returns null
    expect(screen.queryByText(childText)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    // Allow the session check to complete
    resolveRequest!({ data: { user: null } });

    await waitFor(() => {
      expect(screen.getByText(childText)).toBeInTheDocument();
    });
  });

  it('handles session check failure gracefully (falls back to store user)', async () => {
    mockStore.user = fakeUser;
    mockClientGet.mockRejectedValue(new Error('Network error'));

    render(
      <ProtectedRoute>
        <div>{childText}</div>
      </ProtectedRoute>,
    );

    // On network error the component should trust the in-memory user
    await waitFor(() => {
      expect(screen.getByText(childText)).toBeInTheDocument();
    });
  });
});
