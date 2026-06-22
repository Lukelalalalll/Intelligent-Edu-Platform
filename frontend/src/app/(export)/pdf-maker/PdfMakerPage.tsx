"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import "@/app/(presentation-generator)/utils/prism-languages";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { usePathname } from "@/presenton/shims/next-navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { AlertCircle } from "lucide-react";
import { setPresentationData } from "@/store/slices/presentationGeneration";
import { DashboardApi } from "@/app/(presentation-generator)/services/api/dashboard";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import {
  useFontLoader,
  type FontLoadResult,
} from "@/app/(presentation-generator)/hooks/useFontLoad";
import SlideScale from "@/app/(presentation-generator)/components/PresentationRender";
import { normalizeBackendAssetUrls } from "@/utils/api";
import { applyPresentationThemeToElement } from "@/app/(presentation-generator)/presentation/utils/applyPresentationThemeDom";
import {
  getPptxTitleMode,
  PPTX_TITLE_LINE_COUNT_ATTR,
  PPTX_TITLE_MODE_ATTR,
  waitForPptxTitleMeasurementStability,
} from "./pptxTitleMode";

const PDF_PRINT_STYLE = `
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
  }

  #presentation-slides-wrapper {
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    gap: 0 !important;
  }

  #presentation-slides-wrapper .slides-export-stack {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  #presentation-slides-wrapper .main-slide {
    width: 1280px !important;
    min-width: 1280px !important;
    max-width: 1280px !important;
    height: 720px !important;
    min-height: 720px !important;
    max-height: 720px !important;
    flex: 0 0 720px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  #presentation-slides-wrapper .slide-export-inner {
    width: 1280px !important;
    height: 720px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  @media print {
    .export-runtime-alert {
      display: none !important;
    }

    @page {
      size: 1280px 720px;
      margin: 0;
    }

    #presentation-slides-wrapper {
      overflow: visible !important;
    }

    #presentation-slides-wrapper .main-slide {
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    #presentation-slides-wrapper .main-slide:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  }
`;

type PresentationPageProps = {
  presentation_id: string;
  exportCookie?: string;
};

const PPTX_EXPORT_LAYOUT_GROUPS = new Set(["Report", "ProductOverview", "neo-general"]);
const EXPORT_TITLE_MARKER = "data-pptx-title-screenshot";
const SCREENSHOT_ATTRS = [
  "data-screenshot",
  "data-screenshot-include-children",
] as const;

const isPptxExportRuntime = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("exportAs") === "pptx";
};

const clearPptxTitleScreenshotMarkers = (root: ParentNode) => {
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

const markPptxTitleBlocksForScreenshot = async (root: ParentNode) => {
  clearPptxTitleScreenshotMarkers(root);
  await waitForPptxTitleMeasurementStability();
  const slideRoots = root.querySelectorAll<HTMLElement>(".slide-export-inner");

  slideRoots.forEach((slideRoot) => {
    const layoutGroup = slideRoot.dataset.group ?? "";
    if (!PPTX_EXPORT_LAYOUT_GROUPS.has(layoutGroup)) {
      return;
    }

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

const getFontWarningMessages = (
  fontLoadResult: FontLoadResult | null | undefined
): string[] => {
  if (!fontLoadResult) {
    return [];
  }

  return fontLoadResult.skipped
    .filter((entry) => entry.reason !== "missing_name_or_url")
    .map((entry) => {
      switch (entry.reason) {
        case "unsupported_stylesheet_origin":
          return `Skipped external font stylesheet for ${entry.name}. Export will use built-in fallbacks.`;
        case "unsupported_font_origin":
          return `Skipped external font file for ${entry.name}. Export will use built-in fallbacks.`;
        case "invalid_url":
          return `Skipped invalid font URL for ${entry.name}. Export will use built-in fallbacks.`;
        default:
          return `Skipped unsupported font source for ${entry.name}. Export will use built-in fallbacks.`;
      }
    });
};

const PresentationPage = ({ presentation_id, exportCookie }: PresentationPageProps) => {
  const pathname = usePathname();
  const [contentLoading, setContentLoading] = useState(true);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const exportCookieFromHash =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
          "exportCookie"
        ) ?? undefined
      : undefined;
  const effectiveExportCookie = exportCookie ?? exportCookieFromHash;

  const dispatch = useDispatch();
  const { presentationData } = useSelector(
    (state: RootState) => state.presentationGeneration
  );
  const [error, setError] = useState(false);

  const fetchPresentationForExport = useCallback(
    async (id: string, cookieHeader: string) => {
      const response = await fetch(`/api/export-presentation-data/${id}`, {
        method: "GET",
        headers: {
          "x-export-cookie": cookieHeader,
        },
        cache: "no-store",
      });

      return ApiResponseHandler.handleResponse(
        response,
        "Presentation not found"
      );
    },
    []
  );

  const fetchUserSlides = useCallback(async () => {
    setContentLoading(true);
    setError(false);

    try {
      const nextValidationMessages = new Set<string>();
      const data = effectiveExportCookie
        ? await fetchPresentationForExport(presentation_id, effectiveExportCookie)
        : await DashboardApi.getPresentation(presentation_id);
      const normalizedData = normalizeBackendAssetUrls(data);

      if (normalizedData.fonts) {
        getFontWarningMessages(useFontLoader(normalizedData.fonts)).forEach(
          (message) => nextValidationMessages.add(message)
        );
      }

      dispatch(setPresentationData(normalizedData));

      if (normalizedData?.theme) {
        try {
          const wrapper = document.getElementById("presentation-slides-wrapper");
          getFontWarningMessages(
            applyPresentationThemeToElement(wrapper, normalizedData.theme)
          ).forEach((message) => nextValidationMessages.add(message));
        } catch (themeError) {
          nextValidationMessages.add(
            "Theme styling could not be fully applied. Export will continue with default styling where needed."
          );
          console.warn("Theme application skipped for pdf-maker:", themeError);
        }
      }

      const warningMessages = Array.from(nextValidationMessages);
      setValidationMessages(warningMessages);
      warningMessages.forEach((message) => {
        notify.warning("Export rendering adjusted", message);
      });
    } catch (error) {
      setError(true);
      setValidationMessages([]);
      notify.error(
        "Failed to load presentation",
        "The presentation could not be loaded. Please try again."
      );
      console.error("Error fetching user slides:", error);
    } finally {
      setContentLoading(false);
    }
  }, [
    dispatch,
    effectiveExportCookie,
    fetchPresentationForExport,
    presentation_id,
  ]);

  useEffect(() => {
    void fetchUserSlides();
  }, [fetchUserSlides]);

  const slides = presentationData?.slides ?? [];
  const isLoading = contentLoading || (!error && slides.length === 0);

  useEffect(() => {
    if (!isPptxExportRuntime() || isLoading) {
      return;
    }

    const wrapper = document.getElementById("presentation-slides-wrapper");
    if (!wrapper) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      void markPptxTitleBlocksForScreenshot(wrapper);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      clearPptxTitleScreenshotMarkers(wrapper);
    };
  }, [isLoading, slides]);

  return (
    <div className="m-0 flex flex-col overflow-visible p-0">
      {error ? (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
          <div
            className="bg-white border border-red-300 text-red-700 px-6 py-8 rounded-lg shadow-lg flex flex-col items-center"
            role="alert"
          >
            <AlertCircle className="w-16 h-16 mb-4 text-red-500" />
            <strong className="font-bold text-4xl mb-2">Oops!</strong>
            <p className="block text-2xl py-2">
              We encountered an issue loading your presentation.
            </p>
            <p className="text-lg py-2">
              Please check your internet connection or try again later.
            </p>
            <Button
              className="mt-4 bg-red-500 text-white hover:bg-red-600 focus:ring-4 focus:ring-red-300"
              onClick={() => {
                trackEvent(MixpanelEvent.PdfMaker_Retry_Button_Clicked, { pathname });
                window.location.reload();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <style>{PDF_PRINT_STYLE}</style>
          {validationMessages.length > 0 ? (
            <div className="export-runtime-alert mx-auto w-full max-w-[1280px] px-4 py-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {validationMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            </div>
          ) : null}
          <div
            id="presentation-slides-wrapper"
            className="relative m-0 flex w-full flex-col items-center overflow-visible p-0"
          >
            {isLoading ? (
              <div className="relative m-0 flex w-full justify-center p-0">
                <div className="m-0 p-0">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="m-0 h-[720px] w-[1280px] bg-gray-400 p-0"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="slides-export-stack font-inter">
                {slides.map((slide: any, index: number) => (
                  <div
                    key={`${slide.type}-${index}-${slide.index}`}
                    id={`slide-${slide.index}`}
                    className="main-slide relative flex items-center justify-center"
                    data-speaker-note={slide.speaker_note ?? ""}
                  >
                    <div
                      className="slide-export-inner group font-syne"
                      data-layout={slide.layout}
                      data-group={slide.layout_group}
                    >
                      <SlideScale
                        slide={slide}
                        theme={presentationData?.theme ?? null}
                        isEditMode={false}
                        fixedSize
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PresentationPage;
