import type { ComponentType } from "react";

import type { CustomTemplateDetail } from "@/app/hooks/useCustomTemplates";

export const CUSTOM_PREFIX = "custom-";

export type BuiltInPreviewLayout = {
  component: ComponentType<{ data: any }>;
  sampleData: Record<string, unknown>;
  layoutId: string;
  layoutName: string;
  layoutDescription: string;
};

export type PreviewStat = {
  label: string;
  value: string;
  meta: string;
};

export type TemplatePreviewGroup = {
  id: string;
  name?: string;
  description?: string;
};

export type TemplatePreviewParams = {
  templateSlug: string;
  isCustom: boolean;
  customTemplateId: string;
};

export type TemplatePreviewModel = {
  layoutCount: number;
  templateName: string;
  templateDescription: string;
  isMissingTemplate: boolean;
  previewStats: PreviewStat[];
  summaryTitle: string;
  summaryDescription: string;
  mainSectionTitle: string;
  mainSectionDescription: string;
  shouldShowDeleteAction: boolean;
  isCompactBuiltIn: boolean;
  showSummaryCard: boolean;
};

type BuildTemplatePreviewModelInput = {
  isCustom: boolean;
  customTemplate: CustomTemplateDetail | null;
  customLoading: boolean;
  customError: string | null;
  customFontCount: number;
  staticGroup: TemplatePreviewGroup | null;
  staticTemplates: BuiltInPreviewLayout[];
};

export function getTemplatePreviewParams(
  searchParams: URLSearchParams
): TemplatePreviewParams {
  const templateSlug = searchParams.get("slug")?.trim() || "";
  const isCustom = templateSlug.startsWith(CUSTOM_PREFIX);

  return {
    templateSlug,
    isCustom,
    customTemplateId: isCustom ? templateSlug.slice(CUSTOM_PREFIX.length) : "",
  };
}

function buildPreviewStats({
  customFontCount,
  isCustom,
  layoutCount,
}: {
  customFontCount: number;
  isCustom: boolean;
  layoutCount: number;
}): PreviewStat[] {
  const sourceMeta = isCustom
    ? {
        label: customFontCount > 0 ? "Fonts" : "Source",
        value: customFontCount > 0 ? `${customFontCount}` : "Custom",
        meta:
          customFontCount > 0
            ? "Uploaded families detected in this reusable template."
            : "Saved reusable layouts from your workspace.",
      }
    : {
        label: "Source",
        value: "Built-in",
        meta: "Shared Presenton family from the workspace library.",
      };

  return [
    {
      label: "Template type",
      value: isCustom ? "Custom" : "Built-in",
      meta: isCustom
        ? "Preview-only review for a saved custom layout system."
        : "Preview-only review for a shared Presenton family.",
    },
    {
      label: "Layouts",
      value: `${layoutCount}`,
      meta:
        layoutCount === 1
          ? "One layout ready to inspect at full slide size."
          : "Full-size slide stages stay scrollable without shrinking the deck.",
    },
    {
      label: sourceMeta.label,
      value: sourceMeta.value,
      meta: sourceMeta.meta,
    },
  ];
}

export function buildTemplatePreviewModel({
  isCustom,
  customTemplate,
  customLoading,
  customError,
  customFontCount,
  staticGroup,
  staticTemplates,
}: BuildTemplatePreviewModelInput): TemplatePreviewModel {
  const layoutCount = isCustom
    ? customTemplate?.layouts.length || 0
    : staticTemplates.length;

  const templateName = isCustom
    ? customTemplate?.template?.name ||
      customTemplate?.name ||
      "Custom Template"
    : staticGroup?.name || "Template Preview";

  const templateDescription = isCustom
    ? customTemplate?.template?.description ||
      customTemplate?.description ||
      "Review the full slide stack for this saved custom template."
    : staticGroup?.description ||
      "Inspect how this built-in Presenton family is paced before generation starts.";

  const isMissingTemplate =
    (!isCustom && (!staticGroup || staticTemplates.length === 0)) ||
    (isCustom && !customLoading && !customError && !customTemplate);

  const previewStats = buildPreviewStats({
    customFontCount,
    isCustom,
    layoutCount,
  });

  const shouldShowDeleteAction =
    isCustom && !customLoading && !customError && !isMissingTemplate;
  const isCompactBuiltIn =
    !isCustom && !customLoading && !customError && !isMissingTemplate;

  return {
    layoutCount,
    templateName,
    templateDescription,
    isMissingTemplate,
    previewStats,
    summaryTitle: isMissingTemplate
      ? "Template preview unavailable"
      : customLoading
        ? "Preparing this custom template for full-size review."
        : templateName,
    summaryDescription: isMissingTemplate
      ? "We could not find a matching Presenton template family for this slug. Head back to the library and open a different preview."
      : customError
        ? customError
        : customLoading
          ? "Loading saved layouts and compiling the full preview stack inside the Presenton workspace."
          : templateDescription,
    mainSectionTitle: isCustom
      ? "Review every saved layout at full slide size."
      : "Inspect the built-in family layout sequence.",
    mainSectionDescription: isCustom
      ? "Keep this page focused on inspection only: open the stack, compare pacing, and confirm the reusable structure before using the template elsewhere."
      : "Browse the shared family one layout at a time and see how the deck moves before it becomes part of a generation flow.",
    shouldShowDeleteAction,
    isCompactBuiltIn,
    showSummaryCard: !isCompactBuiltIn,
  };
}
