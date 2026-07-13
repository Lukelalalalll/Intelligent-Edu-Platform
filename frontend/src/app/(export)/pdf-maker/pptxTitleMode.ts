export type PptxTitleMode = "single-line-safe" | "preserve-preview";

export const PPTX_TITLE_MODE_ATTR = "data-pptx-title-mode";
export const PPTX_TITLE_LINE_COUNT_ATTR = "data-pptx-title-line-count";

const nextAnimationFrame = async () => {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return;
  }
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

export const waitForPptxTitleMeasurementStability = async (timeoutMs = 1500) => {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready.then(
        () => undefined,
        () => undefined
      ),
      new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
    ]);
  }

  await nextAnimationFrame();
  await nextAnimationFrame();
};

export const resolveRenderedLineHeightPx = (
  style: Pick<CSSStyleDeclaration, "fontSize" | "lineHeight">
) => {
  const fontSizePx = Number.parseFloat(style.fontSize || "0");
  const rawLineHeight = (style.lineHeight || "").trim().toLowerCase();

  if (!rawLineHeight || rawLineHeight === "normal") {
    return fontSizePx > 0 ? fontSizePx * 1.2 : 0;
  }

  const parsed = Number.parseFloat(rawLineHeight);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fontSizePx > 0 ? fontSizePx * 1.2 : 0;
  }

  if (rawLineHeight.endsWith("px")) {
    return parsed;
  }

  if (/^[\d.]+$/.test(rawLineHeight) && fontSizePx > 0 && parsed <= 4) {
    return parsed * fontSizePx;
  }

  return parsed;
};

export const getRenderedTitleLineCount = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  if (rect.height <= 0) {
    return 0;
  }

  const style = window.getComputedStyle(element);
  const lineHeightPx = resolveRenderedLineHeightPx(style);
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(rect.height / lineHeightPx));
};

export const getPptxTitleMode = (
  element: HTMLElement
): { mode: PptxTitleMode; lineCount: number } => {
  const lineCount = Math.max(1, getRenderedTitleLineCount(element));
  return {
    mode: lineCount === 1 ? "single-line-safe" : "preserve-preview",
    lineCount,
  };
};
