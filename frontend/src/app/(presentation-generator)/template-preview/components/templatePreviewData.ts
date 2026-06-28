import type { ComponentType } from "react";

import type { CustomTemplateDetail } from "@/app/hooks/useCustomTemplates";
import type { TranslationKey } from "@/shared/i18n";

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
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
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
  t,
  customFontCount,
  isCustom,
  layoutCount,
}: {
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  customFontCount: number;
  isCustom: boolean;
  layoutCount: number;
}): PreviewStat[] {
  const sourceMeta = isCustom
    ? {
        label: customFontCount > 0 ? t("ppt_generator.templatePreview.stat.source.fonts") : t("ppt_generator.templatePreview.stat.source"),
        value: customFontCount > 0
          ? `${customFontCount}`
          : t("ppt_generator.templatePreview.stat.source.custom"),
        meta:
          customFontCount > 0
            ? t("ppt_generator.templatePreview.stat.source.fontsMeta")
            : t("ppt_generator.templatePreview.stat.source.customMeta"),
      }
    : {
        label: t("ppt_generator.templatePreview.stat.source"),
        value: t("ppt_generator.templatePreview.stat.source.builtIn"),
        meta: t("ppt_generator.templatePreview.stat.source.builtInMeta"),
      };

  return [
    {
      label: t("ppt_generator.templatePreview.stat.templateType"),
      value: isCustom
        ? t("ppt_generator.templatePreview.stat.templateType.custom")
        : t("ppt_generator.templatePreview.stat.templateType.builtIn"),
      meta: isCustom
        ? t("ppt_generator.templatePreview.stat.templateType.customMeta")
        : t("ppt_generator.templatePreview.stat.templateType.builtInMeta"),
    },
    {
      label: t("ppt_generator.templatePreview.stat.layouts"),
      value: `${layoutCount}`,
      meta:
        layoutCount === 1
          ? t("ppt_generator.templatePreview.stat.layouts.single")
          : t("ppt_generator.templatePreview.stat.layouts.multi"),
    },
    {
      label: sourceMeta.label,
      value: sourceMeta.value,
      meta: sourceMeta.meta,
    },
  ];
}

export function buildTemplatePreviewModel({
  t,
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
      t("ppt_generator.templatePreview.badge.custom")
    : staticGroup?.name || t("ppt_generator.templatePreview.banner.title");

  const templateDescription = isCustom
    ? customTemplate?.template?.description ||
      customTemplate?.description ||
      t("ppt_generator.templatePreview.main.customBody")
    : staticGroup?.description ||
      t("ppt_generator.templatePreview.main.builtInBody");

  const isMissingTemplate =
    (!isCustom && (!staticGroup || staticTemplates.length === 0)) ||
    (isCustom && !customLoading && !customError && !customTemplate);

  const previewStats = buildPreviewStats({
    t,
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
      ? t("ppt_generator.templatePreview.summary.missingTitle")
      : customLoading
        ? t("ppt_generator.templatePreview.summary.loadingTitle")
        : templateName,
    summaryDescription: isMissingTemplate
      ? t("ppt_generator.templatePreview.summary.missingBody")
      : customError
        ? customError
        : customLoading
          ? t("ppt_generator.templatePreview.summary.loadingBody")
          : templateDescription,
    mainSectionTitle: isCustom
      ? t("ppt_generator.templatePreview.main.customTitle")
      : t("ppt_generator.templatePreview.main.builtInTitle"),
    mainSectionDescription: isCustom
      ? t("ppt_generator.templatePreview.main.customBody")
      : t("ppt_generator.templatePreview.main.builtInBody"),
    shouldShowDeleteAction,
    isCompactBuiltIn,
    showSummaryCard: !isCompactBuiltIn,
  };
}

