import {
  getPptxTitleMode,
  PPTX_TITLE_LINE_COUNT_ATTR,
  PPTX_TITLE_MODE_ATTR,
  waitForPptxTitleMeasurementStability,
} from "./pptxTitleMode";

const PPTX_EXPORT_LAYOUT_GROUPS = new Set([
  "Report",
  "ProductOverview",
  "neo-general",
]);
const EXPORT_TITLE_MARKER = "data-pptx-title-screenshot";
const SCREENSHOT_ATTRS = [
  "data-screenshot",
  "data-screenshot-include-children",
] as const;

export const isPptxExportRuntime = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("exportAs") === "pptx";
};

type PptxMarkerRoot = Document | HTMLElement;

export const clearPptxTitleScreenshotMarkers = (root: PptxMarkerRoot) => {
  const markedNodes = root.querySelectorAll<HTMLElement>(
    `[${EXPORT_TITLE_MARKER}="true"],[${PPTX_TITLE_MODE_ATTR}],[${PPTX_TITLE_LINE_COUNT_ATTR}]`
  );
  markedNodes.forEach((node) => {
    node.removeAttribute(EXPORT_TITLE_MARKER);
    node.removeAttribute(PPTX_TITLE_MODE_ATTR);
    node.removeAttribute(PPTX_TITLE_LINE_COUNT_ATTR);
    SCREENSHOT_ATTRS.forEach((attr) => node.removeAttribute(attr));
  });
};

const isLikelyTitleHeading = (element: HTMLElement, slideRect: DOMRect) => {
  const text = element.textContent?.trim() ?? "";
  if (!text) {
    return false;
  }
  const computedStyle = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const fontSize = Number.parseFloat(computedStyle.fontSize || "0");
  const fontWeight = Number.parseInt(computedStyle.fontWeight || "400", 10);
  const topOffset = rect.top - slideRect.top;
  const widthRatio = slideRect.width > 0 ? rect.width / slideRect.width : 0;

  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  if (topOffset < 0 || topOffset > slideRect.height * 0.32) {
    return false;
  }
  if (fontSize < 28 || fontWeight < 500) {
    return false;
  }
  if (widthRatio < 0.18 || widthRatio > 0.96) {
    return false;
  }
  return true;
};

const chooseTopTitleHeading = (slideRoot: HTMLElement) => {
  const slideRect = slideRoot.getBoundingClientRect();
  const candidates = Array.from(
    slideRoot.querySelectorAll<HTMLElement>("h1, h2, h3")
  ).filter((element) => isLikelyTitleHeading(element, slideRect));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const topDelta = leftRect.top - rightRect.top;
    if (Math.abs(topDelta) > 4) {
      return topDelta;
    }

    const leftStyle = window.getComputedStyle(left);
    const rightStyle = window.getComputedStyle(right);
    const leftFontSize = Number.parseFloat(leftStyle.fontSize || "0");
    const rightFontSize = Number.parseFloat(rightStyle.fontSize || "0");
    if (leftFontSize !== rightFontSize) {
      return rightFontSize - leftFontSize;
    }

    const leftArea = leftRect.width * leftRect.height;
    const rightArea = rightRect.width * rightRect.height;
    return rightArea - leftArea;
  });

  return candidates[0];
};

export const markPptxTitleBlocksForScreenshot = async (root: PptxMarkerRoot) => {
  clearPptxTitleScreenshotMarkers(root);
  await waitForPptxTitleMeasurementStability();
  const slideRoots = root.querySelectorAll<HTMLElement>(".slide-export-inner");

  slideRoots.forEach((slideRoot) => {
    const layoutGroup = slideRoot.dataset.group ?? "";
    if (!PPTX_EXPORT_LAYOUT_GROUPS.has(layoutGroup)) {
      return;
    }

    // Export screenshots depend on rendered font metrics and slide geometry here.
    // Keep this heuristic local and stable unless the exporter contract changes.
    const titleHeading = chooseTopTitleHeading(slideRoot);
    if (!titleHeading) {
      return;
    }

    const { mode, lineCount } = getPptxTitleMode(titleHeading);

    titleHeading.setAttribute(PPTX_TITLE_MODE_ATTR, mode);
    titleHeading.setAttribute(PPTX_TITLE_LINE_COUNT_ATTR, String(lineCount));

    if (mode === "single-line-safe") {
      titleHeading.setAttribute(EXPORT_TITLE_MARKER, "true");
      titleHeading.setAttribute("data-screenshot", "true");
      titleHeading.setAttribute("data-screenshot-include-children", "true");
      return;
    }

    titleHeading.removeAttribute(EXPORT_TITLE_MARKER);
    SCREENSHOT_ATTRS.forEach((attr) => titleHeading.removeAttribute(attr));
  });
};
