export type FontLoadSkipReason =
  | "missing_name_or_url"
  | "invalid_url"
  | "unsupported_stylesheet_origin"
  | "unsupported_font_origin";

export type FontLoadEntryResult = {
  name: string;
  url: string;
  strategy?: "stylesheet" | "font-face";
  reason?: FontLoadSkipReason;
};

export type FontLoadResult = {
  loaded: FontLoadEntryResult[];
  skipped: FontLoadEntryResult[];
};

const GOOGLE_FONTS_STYLESHEET_ORIGIN = "https://fonts.googleapis.com";

const buildEmptyResult = (): FontLoadResult => ({
  loaded: [],
  skipped: [],
});

const resolveFontUrl = (url: string): URL | null => {
  try {
    return new URL(url, window.location.origin);
  } catch {
    return null;
  }
};

const isAllowedStylesheetUrl = (url: URL): boolean =>
  url.origin === window.location.origin ||
  url.origin === GOOGLE_FONTS_STYLESHEET_ORIGIN;

const isAllowedFontUrl = (url: URL): boolean =>
  url.protocol === "data:" ||
  url.origin === window.location.origin ||
  (url.protocol === "blob:" && url.origin === window.location.origin);

export const useFontLoader = (fonts: Record<string, string>): FontLoadResult => {
  const result = buildEmptyResult();

  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !fonts ||
    typeof fonts !== "object"
  ) {
    return result;
  }

  const ensureStylesheetLink = (href: URL, name: string) => {
    const fontKey = encodeURIComponent(href.toString());
    const existing = document.querySelector(
      `link[rel="stylesheet"][data-font-key="${fontKey}"]`
    );
    if (existing) {
      result.loaded.push({
        name,
        url: href.toString(),
        strategy: "stylesheet",
      });
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href.toString();
    link.setAttribute("data-font-key", fontKey);
    document.head.appendChild(link);
    result.loaded.push({
      name,
      url: href.toString(),
      strategy: "stylesheet",
    });
  };

  const ensureFontFaceStyle = (name: string, srcUrl: URL) => {
    const fontKey = encodeURIComponent(srcUrl.toString());
    const existing = document.querySelector(`style[data-font-key="${fontKey}"]`);
    if (existing) {
      result.loaded.push({
        name,
        url: srcUrl.toString(),
        strategy: "font-face",
      });
      return;
    }

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-font-key", fontKey);
    styleEl.textContent = `@font-face {\n  font-family: ${JSON.stringify(
      name
    )};\n  src: url(${JSON.stringify(
      srcUrl.toString()
    )});\n  font-style: normal;\n  font-display: swap;\n}`;
    document.head.appendChild(styleEl);
    result.loaded.push({
      name,
      url: srcUrl.toString(),
      strategy: "font-face",
    });
  };

  Object.entries(fonts).forEach(([rawName, rawUrl]) => {
    const name = rawName?.trim();
    const url = rawUrl?.trim();

    if (!name || !url) {
      result.skipped.push({
        name: name ?? "",
        url: url ?? "",
        reason: "missing_name_or_url",
      });
      return;
    }

    const resolvedUrl = resolveFontUrl(url);
    if (!resolvedUrl) {
      result.skipped.push({
        name,
        url,
        reason: "invalid_url",
      });
      return;
    }

    const isStylesheet =
      /\.css(\?|$)/i.test(resolvedUrl.pathname) ||
      resolvedUrl.origin === GOOGLE_FONTS_STYLESHEET_ORIGIN;

    if (isStylesheet) {
      if (!isAllowedStylesheetUrl(resolvedUrl)) {
        result.skipped.push({
          name,
          url: resolvedUrl.toString(),
          strategy: "stylesheet",
          reason: "unsupported_stylesheet_origin",
        });
        return;
      }
      ensureStylesheetLink(resolvedUrl, name);
      return;
    }

    if (!isAllowedFontUrl(resolvedUrl)) {
      result.skipped.push({
        name,
        url: resolvedUrl.toString(),
        strategy: "font-face",
        reason: "unsupported_font_origin",
      });
      return;
    }

    ensureFontFaceStyle(name, resolvedUrl);
  });

  return result;
};

