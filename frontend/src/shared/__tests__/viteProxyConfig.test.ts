// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('vite dev proxy config', () => {
  const originalToken = process.env.INTERNAL_GATEWAY_TOKEN;
  const originalWarn = console.warn;
  let tempCwd = '';
  let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.INTERNAL_GATEWAY_TOKEN;
    console.warn = vi.fn();
    tempCwd = mkdtempSync(path.join(tmpdir(), 'vite-proxy-config-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempCwd);
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.INTERNAL_GATEWAY_TOKEN;
    } else {
      process.env.INTERNAL_GATEWAY_TOKEN = originalToken;
    }
    console.warn = originalWarn;
    cwdSpy?.mockRestore();
    cwdSpy = null;
    if (tempCwd) {
      rmSync(tempCwd, { recursive: true, force: true });
      tempCwd = '';
    }
  });

  it('injects X-Internal-Gateway into proxied dev requests when token is configured', async () => {
    process.env.INTERNAL_GATEWAY_TOKEN = 'dev-token';

    const { default: createConfig } = await import('../../../vite.config.js');
    const config = createConfig({ command: 'serve', mode: 'development' } as any);

    expect(config.server?.proxy?.['/api']).toMatchObject({
      headers: { 'X-Internal-Gateway': 'dev-token' },
    });
    expect(config.server?.proxy?.['/static']).toMatchObject({
      headers: { 'X-Internal-Gateway': 'dev-token' },
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns in dev when INTERNAL_GATEWAY_TOKEN is missing', async () => {
    const { default: createConfig } = await import('../../../vite.config.js');
    const config = createConfig({ command: 'serve', mode: 'development' } as any);

    expect(config.server?.proxy?.['/api']).toMatchObject({ headers: {} });
    expect(console.warn).toHaveBeenCalledWith(
      '[vite] INTERNAL_GATEWAY_TOKEN is not set. Local /api proxy requests will fail until it matches backend/.env.'
    );
  });
});
