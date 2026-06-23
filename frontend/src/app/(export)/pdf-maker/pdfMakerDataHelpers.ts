import type { FontLoadResult } from "@/app/(presentation-generator)/hooks/useFontLoad";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import type { Theme } from "@/app/(presentation-generator)/services/api/types";
import { applyPresentationThemeToElement } from "@/app/(presentation-generator)/presentation/utils/applyPresentationThemeDom";

export const getExportCookieFromHash = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
      "exportCookie"
    ) ?? undefined
  );
};

export const fetchPresentationForExport = async (
  id: string,
  cookieHeader: string
) => {
  const response = await fetch(`/api/export-presentation-data/${id}`, {
    method: "GET",
    headers: {
      "x-export-cookie": cookieHeader,
    },
    cache: "no-store",
  });

  return ApiResponseHandler.handleResponse(response, "Presentation not found");
};

export const getFontWarningMessages = (
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

export const collectThemeWarningMessages = (theme: Theme | null | undefined) => {
  const wrapper = document.getElementById("presentation-slides-wrapper");
  return getFontWarningMessages(applyPresentationThemeToElement(wrapper, theme));
};
