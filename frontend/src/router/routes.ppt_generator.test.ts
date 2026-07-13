import { describe, expect, it } from 'vitest';

import { ROUTES } from './routes';

const PPT_GENERATOR_LAYOUT_ROUTES = [
  'slides/ppt_generator',
  'slides/ppt_generator/documents-preview',
  'slides/ppt_generator/outline',
  'slides/ppt_generator/presentation',
  'slides/ppt_generator/dashboard',
  'slides/ppt_generator/templates',
  'slides/ppt_generator/theme',
  'slides/ppt_generator/settings',
  'slides/ppt_generator/template-preview',
  'slides/ppt_generator/custom-template',
  'slides/ppt_generator/workspace',
  'slides/ppt_generator/quick-process',
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

describe('PPT Generator route shell placement', () => {
  it('keeps user-facing PPT Generator routes inside the shared app layout', () => {
    for (const path of PPT_GENERATOR_LAYOUT_ROUTES) {
      const route = ROUTES.find((item) => item.path === path);
      expect(route, `expected route config for ${path}`).toBeDefined();
      expect(route?.fullScreen, `expected ${path} to use shared layout`).not.toBe(true);
    }
  });

  it('keeps export-only PPT Generator routes full-screen', () => {
    expect(ROUTES.find((item) => item.path === 'slides/ppt_generator/pdf-maker')?.fullScreen).toBe(true);
    expect(ROUTES.find((item) => item.path === 'pdf-maker')?.fullScreen).toBe(true);
  });
});


