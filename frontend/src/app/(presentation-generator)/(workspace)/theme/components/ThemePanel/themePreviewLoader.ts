import type { TemplateWithData } from "@/app/presentation-templates/utils";

const THEME_PREVIEW_TEMPLATE_ID = "neo-general";
export const THEME_PREVIEW_LAYOUT_LIMIT = 2;

export type ThemePreviewLayout = Pick<
  TemplateWithData,
  "component" | "layoutId" | "sampleData"
>;

let themePreviewLayoutsCache: ThemePreviewLayout[] | null = null;
let themePreviewLayoutsRequest: Promise<ThemePreviewLayout[]> | null = null;

export async function loadThemePreviewLayouts(): Promise<ThemePreviewLayout[]> {
  if (themePreviewLayoutsCache) {
    return themePreviewLayoutsCache;
  }

  if (!themePreviewLayoutsRequest) {
    themePreviewLayoutsRequest = import("@/app/presentation-templates")
      .then(({ getTemplatesByTemplateName }) => {
        const previewLayouts = getTemplatesByTemplateName(THEME_PREVIEW_TEMPLATE_ID)
          .slice(0, THEME_PREVIEW_LAYOUT_LIMIT)
          .map(({ component, layoutId, sampleData }) => ({
            component,
            layoutId,
            sampleData,
          }));

        themePreviewLayoutsCache = previewLayouts;
        return previewLayouts;
      })
      .finally(() => {
        themePreviewLayoutsRequest = null;
      });
  }

  return themePreviewLayoutsRequest;
}

