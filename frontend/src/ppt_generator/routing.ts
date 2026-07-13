const PPT_GENERATOR_CANONICAL_BASE = "/slides/ppt_generator";

const INTERNAL_TO_CANONICAL: Record<string, string> = {
  "/upload": PPT_GENERATOR_CANONICAL_BASE,
  "/documents-preview": `${PPT_GENERATOR_CANONICAL_BASE}/documents-preview`,
  "/outline": `${PPT_GENERATOR_CANONICAL_BASE}/outline`,
  "/presentation": `${PPT_GENERATOR_CANONICAL_BASE}/presentation`,
  "/dashboard": `${PPT_GENERATOR_CANONICAL_BASE}/dashboard`,
  "/templates": `${PPT_GENERATOR_CANONICAL_BASE}/templates`,
  "/theme": `${PPT_GENERATOR_CANONICAL_BASE}/theme`,
  "/settings": `${PPT_GENERATOR_CANONICAL_BASE}/settings`,
  "/template-preview": `${PPT_GENERATOR_CANONICAL_BASE}/template-preview`,
  "/custom-template": `${PPT_GENERATOR_CANONICAL_BASE}/custom-template`,
  "/pdf-maker": `${PPT_GENERATOR_CANONICAL_BASE}/pdf-maker`,
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

export const normalizePptGeneratorPathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (CANONICAL_TO_INTERNAL.has(normalized)) {
    return CANONICAL_TO_INTERNAL.get(normalized)!;
  }
  return normalized;
};

export const mapPptGeneratorHrefToAppRoute = (href: string): string => {
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

export const getPptGeneratorCanonicalBase = () => PPT_GENERATOR_CANONICAL_BASE;

