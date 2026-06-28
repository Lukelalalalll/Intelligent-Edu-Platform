import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Layout from '../Layout';
import styles from '../Layout.module.css';
import { isEdgeToEdgeRoute } from '../layoutRouteUtils';

const mockStore = {
  user: {
    id: '1',
    username: 'alice',
    email: 'alice@example.com',
    role: 'admin',
  },
  status: 'authenticated' as const,
  isSessionLoading: false,
  logout: vi.fn(),
};

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

vi.mock('@/features/chat/hooks/useChatUnreadSync', () => ({
  useChatUnreadSync: vi.fn(),
}));

vi.mock('../NetworkBanner', () => ({
  default: () => <div data-testid="network-banner" />,
}));

vi.mock('../layout/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../layout/Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}));

vi.mock('../layout/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

describe('Layout edge-to-edge routing', () => {
  beforeEach(() => {
    mockStore.logout.mockReset();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
  });

  it('marks the presentation editor route as edge-to-edge', () => {
    expect(isEdgeToEdgeRoute('/slides/ppt_generator/presentation')).toBe(true);
    expect(isEdgeToEdgeRoute('/presentation')).toBe(true);
    expect(isEdgeToEdgeRoute('/slides/ppt_generator/dashboard')).toBe(false);
  });

  it('removes shared main padding and width constraints on the presentation editor route', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/slides/ppt_generator/presentation?id=test-presentation']}>
        <Routes>
          <Route element={<Layout />}>
            <Route
              path="/slides/ppt_generator/presentation"
              element={<div data-testid="presentation-page">Presentation</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const main = container.querySelector('main');

    expect(main?.className).toContain(styles.mainContent);
    expect(main?.className).toContain(styles.mainContentEdgeToEdge);
  });
});
