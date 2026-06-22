const PRESENTON_CANONICAL_BASE = "/slides/presenton";

const INTERNAL_TO_CANONICAL: Record<string, string> = {
  "/upload": PRESENTON_CANONICAL_BASE,
  "/documents-preview": `${PRESENTON_CANONICAL_BASE}/documents-preview`,
  "/outline": `${PRESENTON_CANONICAL_BASE}/outline`,
  "/presentation": `${PRESENTON_CANONICAL_BASE}/presentation`,
  "/dashboard": `${PRESENTON_CANONICAL_BASE}/dashboard`,
  "/templates": `${PRESENTON_CANONICAL_BASE}/templates`,
  "/theme": `${PRESENTON_CANONICAL_BASE}/theme`,
  "/settings": `${PRESENTON_CANONICAL_BASE}/settings`,
  "/template-preview": `${PRESENTON_CANONICAL_BASE}/template-preview`,
  "/custom-template": `${PRESENTON_CANONICAL_BASE}/custom-template`,
  "/pdf-maker": `${PRESENTON_CANONICAL_BASE}/pdf-maker`,
};

const CANONICAL_TO_INTERNAL = new Map(
  Object.entries(INTERNAL_TO_CANONICAL).map(([internalPath, canonicalPath]) => [
    canonicalPath,
    internalPath,
  ])
);

const splitSuffix = (input: string): { path: string; suffix: string } => {
  const hashIndex = input.indexOf("#");
  const queryIndex = input.indexOf("?");
  const suffixIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);

  if (suffixIndex === -1) {
    return { path: input, suffix: "" };
  }

  return {
    path: input.slice(0, suffixIndex),
    suffix: input.slice(suffixIndex),
  };
};

export const normalizePresentonPathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (CANONICAL_TO_INTERNAL.has(normalized)) {
    return CANONICAL_TO_INTERNAL.get(normalized)!;
  }
  return normalized;
};

export const mapPresentonHrefToAppRoute = (href: string): string => {
  if (!href || href.startsWith("?") || href.startsWith("#")) {
    return href;
  }

  if (/^[a-z]+:\/\//i.test(href)) {
    return href;
  }

  const { path, suffix } = splitSuffix(href);
  const mapped = INTERNAL_TO_CANONICAL[path] || path;
  return `${mapped}${suffix}`;
};

export const getPresentonCanonicalBase = () => PRESENTON_CANONICAL_BASE;
