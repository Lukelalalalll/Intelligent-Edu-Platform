import { describe, expect, it, vi } from 'vitest';

vi.mock('mixpanel-browser', () => ({
  default: {
    get_distinct_id: vi.fn(() => 'test-distinct-id'),
    identify: vi.fn(),
    init: vi.fn(),
    register: vi.fn(),
    track: vi.fn(),
  },
}));

import { sanitizeMixpanelProps } from './mixpanel';

describe('sanitizeMixpanelProps', () => {
  it('redacts sensitive telemetry fields', () => {
    const props = sanitizeMixpanelProps({
      prompt: 'write a private essay',
      file_name: 'student-grades.pdf',
      apiKey: 'sk-live',
      nested: {
        content: 'raw answer body',
        safe_count: 2,
      },
    });

    expect(props).toEqual({
      prompt: '[redacted]',
      file_name: '[redacted]',
      apiKey: '[redacted]',
      nested: {
        content: '[redacted]',
        safe_count: 2,
      },
    });
  });
});
