import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';

import FileCenterPanel from './FileCenterPanel';

vi.mock('../../../api/fileCenterApi', () => ({
  fileCenterApi: {
    listAssets: vi.fn().mockResolvedValue({
      assets: [
        {
          file_id: 'f1',
          file_type: 'chat_attachment',
          status: 'active',
          filename: 'sample.pdf',
          storage_path: 'uploads/sample.pdf',
          size: 1024,
          owner_type: 'chat_message',
          owner_id: 'm1',
          exists_on_disk: true,
        },
      ],
      total: 1,
    }),
    getStats: vi.fn().mockResolvedValue({ rows: [] }),
    getAudit: vi.fn().mockResolvedValue({ counts: { orphan_disk_files: 0, dangling_registry: 0 } }),
    softDelete: vi.fn(),
    restore: vi.fn(),
    hardDelete: vi.fn(),
  },
}));

describe('FileCenterPanel smoke', () => {
  it('renders and loads first asset row', async () => {
    render(<FileCenterPanel />);
    expect(screen.getByText('File Center')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('sample.pdf')).toBeInTheDocument();
    });
  });
});
