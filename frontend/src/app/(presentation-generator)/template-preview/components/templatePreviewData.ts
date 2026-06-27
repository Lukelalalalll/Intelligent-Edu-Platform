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
        label: customFontCount > 0 ? t("presenton.templatePreview.stat.source.fonts") : t("presenton.templatePreview.stat.source"),
        value: customFontCount > 0
          ? `${customFontCount}`
          : t("presenton.templatePreview.stat.source.custom"),
        meta:
          customFontCount > 0
            ? t("presenton.templatePreview.stat.source.fontsMeta")
            : t("presenton.templatePreview.stat.source.customMeta"),
      }
    : {
        label: t("presenton.templatePreview.stat.source"),
        value: t("presenton.templatePreview.stat.source.builtIn"),
        meta: t("presenton.templatePreview.stat.source.builtInMeta"),
      };

  return [
    {
      label: t("presenton.templatePreview.stat.templateType"),
      value: isCustom
        ? t("presenton.templatePreview.stat.templateType.custom")
        : t("presenton.templatePreview.stat.templateType.builtIn"),
      meta: isCustom
        ? t("presenton.templatePreview.stat.templateType.customMeta")
        : t("presenton.templatePreview.stat.templateType.builtInMeta"),
    },
    {
      label: t("presenton.templatePreview.stat.layouts"),
      value: `${layoutCount}`,
      meta:
        layoutCount === 1
          ? t("presenton.templatePreview.stat.layouts.single")
          : t("presenton.templatePreview.stat.layouts.multi"),
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
      t("presenton.templatePreview.badge.custom")
    : staticGroup?.name || t("presenton.templatePreview.banner.title");

  const templateDescription = isCustom
    ? customTemplate?.template?.description ||
      customTemplate?.description ||
      t("presenton.templatePreview.main.customBody")
    : staticGroup?.description ||
      t("presenton.templatePreview.main.builtInBody");

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
      ? t("presenton.templatePreview.summary.missingTitle")
      : customLoading
        ? t("presenton.templatePreview.summary.loadingTitle")
        : templateName,
    summaryDescription: isMissingTemplate
      ? t("presenton.templatePreview.summary.missingBody")
      : customError
        ? customError
        : customLoading
          ? t("presenton.templatePreview.summary.loadingBody")
          : templateDescription,
    mainSectionTitle: isCustom
      ? t("presenton.templatePreview.main.customTitle")
      : t("presenton.templatePreview.main.builtInTitle"),
    mainSectionDescription: isCustom
      ? t("presenton.templatePreview.main.customBody")
      : t("presenton.templatePreview.main.builtInBody"),
    shouldShowDeleteAction,
    isCompactBuiltIn,
    showSummaryCard: !isCompactBuiltIn,
  };
}
