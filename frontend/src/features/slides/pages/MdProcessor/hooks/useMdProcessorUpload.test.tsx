import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMdProcessorUpload } from './useMdProcessorUpload';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/shared/api/client', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}));

const storage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

describe('useMdProcessorUpload', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
    });
    getMock.mockReset();
    postMock.mockReset();
    localStorage.clear();
  });

  it('checks the session before uploading and lets the browser build the multipart headers', async () => {
    getMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    postMock.mockResolvedValue({
      data: {
        filename: 'test.md',
        headers: [],
        tables: [],
      },
    });

    const { result } = renderHook(() => useMdProcessorUpload());
    const file = new File(['## Title\n- Bullet'], 'test.md', { type: 'text/markdown' });

    await act(async () => {
      await result.current.processFile(file);
    });

    expect(getMock).toHaveBeenCalledWith('/session', {
      headers: { 'X-Skip-Auth-Retry': '1' },
    });
    expect(postMock).toHaveBeenCalledTimes(1);

    const [url, formData, config] = postMock.mock.calls[0];
    expect(url).toBe('/slides/parse-md');
    expect(formData).toBeInstanceOf(FormData);
    expect(config).not.toHaveProperty('headers');
    expect(result.current.currentFilename).toBe('test.md');
    expect(result.current.errorMsg).toBe('');
  });

  it('surfaces the session error without starting the file upload', async () => {
    getMock.mockRejectedValue({
      response: {
        data: {
          detail: 'Please log in first',
        },
      },
    });

    const { result } = renderHook(() => useMdProcessorUpload());
    const file = new File(['## Title\n- Bullet'], 'test.md', { type: 'text/markdown' });

    await act(async () => {
      await result.current.processFile(file);
    });

    expect(postMock).not.toHaveBeenCalled();
    expect(result.current.errorMsg).toBe('Please log in first');
    expect(result.current.uploadStatus).toBe('error');
  });
});
