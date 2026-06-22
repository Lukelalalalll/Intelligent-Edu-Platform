import { describe, expect, it } from 'vitest';

import { ROUTES } from './routes';

const PRESENTON_LAYOUT_ROUTES = [
  'slides/presenton',
  'slides/presenton/documents-preview',
  'slides/presenton/outline',
  'slides/presenton/presentation',
  'slides/presenton/dashboard',
  'slides/presenton/templates',
  'slides/presenton/theme',
  'slides/presenton/settings',
  'slides/presenton/template-preview',
  'slides/presenton/custom-template',
  'slides/presenton/workspace',
  'slides/presenton/quick-process',
  'upload',
  'documents-preview',
  'outline',
  'presentation',
  'dashboard',
  'templates',
  'theme',
  'settings',
  'template-preview',
  'custom-template',
] as const;

describe('Presenton route shell placement', () => {
  it('keeps user-facing Presenton routes inside the shared app layout', () => {
    for (const path of PRESENTON_LAYOUT_ROUTES) {
      const route = ROUTES.find((item) => item.path === path);
      expect(route, `expected route config for ${path}`).toBeDefined();
      expect(route?.fullScreen, `expected ${path} to use shared layout`).not.toBe(true);
    }
  });

  it('keeps export-only Presenton routes full-screen', () => {
    expect(ROUTES.find((item) => item.path === 'slides/presenton/pdf-maker')?.fullScreen).toBe(true);
    expect(ROUTES.find((item) => item.path === 'pdf-maker')?.fullScreen).toBe(true);
  });
});
