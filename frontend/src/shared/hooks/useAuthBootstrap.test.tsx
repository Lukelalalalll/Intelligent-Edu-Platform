import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('../store/useAuthStore', () => ({
  SESSION_CHECK_INTERVAL: 5 * 60 * 1000,
  useAuthStore: (selector?: (state: any) => unknown) => {
    const state = {
      user: null,
      status: 'unknown',
      isSessionLoading: false,
      lastValidatedAt: 0,
    };
    if (typeof selector === 'function') {
      return selector(state);
    }
    return state;
  },
}));

import { shouldBypassAuthBootstrap, useAuthBootstrap } from './useAuthBootstrap';

function AuthBootstrapHarness({ enabled = true }: { enabled?: boolean }) {
  useAuthBootstrap({ enabled });
  return null;
}

describe('useAuthBootstrap', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { user: null } });
  });

  it('bypasses auth bootstrap for export routes', () => {
    expect(shouldBypassAuthBootstrap('/pdf-maker')).toBe(true);
    expect(shouldBypassAuthBootstrap('/slides/ppt_generator/pdf-maker')).toBe(true);
    expect(shouldBypassAuthBootstrap('/slides/ppt_generator/presentation')).toBe(false);
  });

  it('does not call session bootstrap when disabled for export rendering', () => {
    render(
      <MemoryRouter initialEntries={['/pdf-maker?id=demo']}>
        <AuthBootstrapHarness enabled={false} />
      </MemoryRouter>
    );

    expect(mockGet).not.toHaveBeenCalled();
  });
});
