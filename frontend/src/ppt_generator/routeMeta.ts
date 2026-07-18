const PPT_GENERATOR_CANONICAL_BASE = '/slides/ppt_generator' as const;

export const PPT_GENERATOR_ROUTE_PATHS = {
  canonicalBase: PPT_GENERATOR_CANONICAL_BASE,
  upload: PPT_GENERATOR_CANONICAL_BASE,
  documentsPreview: `${PPT_GENERATOR_CANONICAL_BASE}/documents-preview`,
  outline: `${PPT_GENERATOR_CANONICAL_BASE}/outline`,
  presentation: `${PPT_GENERATOR_CANONICAL_BASE}/presentation`,
  dashboard: `${PPT_GENERATOR_CANONICAL_BASE}/dashboard`,
  templates: `${PPT_GENERATOR_CANONICAL_BASE}/templates`,
  theme: `${PPT_GENERATOR_CANONICAL_BASE}/theme`,
  settings: `${PPT_GENERATOR_CANONICAL_BASE}/settings`,
  templatePreview: `${PPT_GENERATOR_CANONICAL_BASE}/template-preview`,
  customTemplate: `${PPT_GENERATOR_CANONICAL_BASE}/custom-template`,
  pdfMaker: `${PPT_GENERATOR_CANONICAL_BASE}/pdf-maker`,
  legacyUpload: '/upload',
  legacyDocumentsPreview: '/documents-preview',
  legacyOutline: '/outline',
  legacyPresentation: '/presentation',
  legacyDashboard: '/dashboard',
  legacyTemplates: '/templates',
  legacyTheme: '/theme',
  legacySettings: '/settings',
  legacyTemplatePreview: '/template-preview',
  legacyCustomTemplate: '/custom-template',
  legacyPdfMaker: '/pdf-maker',
  legacyWorkspace: `${PPT_GENERATOR_CANONICAL_BASE}/workspace`,
  legacyQuickProcess: `${PPT_GENERATOR_CANONICAL_BASE}/quick-process`,
  legacyUploadRoute: `${PPT_GENERATOR_CANONICAL_BASE}/upload`,
} as const;

const LEGACY_TO_CANONICAL: Record<string, string> = {
  [PPT_GENERATOR_ROUTE_PATHS.legacyUpload]: PPT_GENERATOR_ROUTE_PATHS.upload,
  [PPT_GENERATOR_ROUTE_PATHS.legacyDocumentsPreview]: PPT_GENERATOR_ROUTE_PATHS.documentsPreview,
  [PPT_GENERATOR_ROUTE_PATHS.legacyOutline]: PPT_GENERATOR_ROUTE_PATHS.outline,
  [PPT_GENERATOR_ROUTE_PATHS.legacyPresentation]: PPT_GENERATOR_ROUTE_PATHS.presentation,
  [PPT_GENERATOR_ROUTE_PATHS.legacyDashboard]: PPT_GENERATOR_ROUTE_PATHS.dashboard,
  [PPT_GENERATOR_ROUTE_PATHS.legacyTemplates]: PPT_GENERATOR_ROUTE_PATHS.templates,
  [PPT_GENERATOR_ROUTE_PATHS.legacyTheme]: PPT_GENERATOR_ROUTE_PATHS.theme,
  [PPT_GENERATOR_ROUTE_PATHS.legacySettings]: PPT_GENERATOR_ROUTE_PATHS.settings,
  [PPT_GENERATOR_ROUTE_PATHS.legacyTemplatePreview]: PPT_GENERATOR_ROUTE_PATHS.templatePreview,
  [PPT_GENERATOR_ROUTE_PATHS.legacyCustomTemplate]: PPT_GENERATOR_ROUTE_PATHS.customTemplate,
  [PPT_GENERATOR_ROUTE_PATHS.legacyPdfMaker]: PPT_GENERATOR_ROUTE_PATHS.pdfMaker,
};

const PPT_GENERATOR_COVERED_PATHS = new Set([
  PPT_GENERATOR_ROUTE_PATHS.upload,
  PPT_GENERATOR_ROUTE_PATHS.documentsPreview,
  PPT_GENERATOR_ROUTE_PATHS.outline,
  PPT_GENERATOR_ROUTE_PATHS.presentation,
  PPT_GENERATOR_ROUTE_PATHS.dashboard,
  PPT_GENERATOR_ROUTE_PATHS.templates,
  PPT_GENERATOR_ROUTE_PATHS.theme,
  PPT_GENERATOR_ROUTE_PATHS.settings,
  PPT_GENERATOR_ROUTE_PATHS.templatePreview,
  PPT_GENERATOR_ROUTE_PATHS.customTemplate,
  PPT_GENERATOR_ROUTE_PATHS.pdfMaker,
  PPT_GENERATOR_ROUTE_PATHS.legacyWorkspace,
  PPT_GENERATOR_ROUTE_PATHS.legacyQuickProcess,
]);

const PPT_GENERATOR_AUTH_BYPASS_PATHS = new Set([
  PPT_GENERATOR_ROUTE_PATHS.pdfMaker,
]);

const splitSuffix = (input: string): { path: string; suffix: string } => {
  const hashIndex = input.indexOf('#');
  const queryIndex = input.indexOf('?');
  const suffixIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);

  if (suffixIndex === -1) {
    return { path: input, suffix: '' };
  }

  return {
    path: input.slice(0, suffixIndex),
    suffix: input.slice(suffixIndex),
  };
};

export function normalizePptGeneratorPathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return LEGACY_TO_CANONICAL[normalized] || normalized;
}

export function isPptGeneratorRoutePath(pathname: string): boolean {
  const normalized = normalizePptGeneratorPathname(pathname);
  return normalized === PPT_GENERATOR_ROUTE_PATHS.canonicalBase || PPT_GENERATOR_COVERED_PATHS.has(normalized);
}

export function shouldBypassAuthBootstrap(pathname: string): boolean {
  const normalized = normalizePptGeneratorPathname(pathname);
  return PPT_GENERATOR_AUTH_BYPASS_PATHS.has(normalized);
}

export function mapPptGeneratorHrefToAppRoute(href: string): string {
  if (!href || href.startsWith('?') || href.startsWith('#')) {
    return href;
  }

  if (/^[a-z]+:\/\//i.test(href)) {
    return href;
  }

  const { path, suffix } = splitSuffix(href);
  const mapped = LEGACY_TO_CANONICAL[path] || path;
  return `${mapped}${suffix}`;
}

export function getPptGeneratorCanonicalBase(): string {
  return PPT_GENERATOR_CANONICAL_BASE;
}
