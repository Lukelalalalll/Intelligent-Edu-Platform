"use client";

import React, { memo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";
import {
  CustomTemplates,
  useCustomTemplatePreview,
} from "@/app/hooks/useCustomTemplates";
import {
  TemplatePreviewStage,
  LayoutsBadge,
  CustomTemplatePreview,
} from "../../components/TemplatePreviewComponents";
import { getCustomTemplateDisplayName } from "../../(workspace)/templates/components/templatePanelHelpers";

const outlineBodyFontStyle = {
  fontFamily: "var(--outline-body-font, var(--body-font-family, inherit))",
} as const;

export const CustomTemplateCard = memo(function CustomTemplateCard({
  template,
  onSelectTemplate,
  selectedTemplate,
}: {
  template: CustomTemplates;
  onSelectTemplate: (template: string) => void;
  selectedTemplate: string | null;
}) {
  const { t } = useI18n();
  const { previewLayouts, loading } = useCustomTemplatePreview(template.id);
  const isSelected = selectedTemplate === template.id;
  const displayName = getCustomTemplateDisplayName(template.name, t);

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden rounded-[22px] border bg-white/94 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_32px_-24px_rgba(0,123,85,0.22)]",
        isSelected
          ? "border-[rgba(0,123,85,0.28)] ring-2 ring-[rgba(0,123,85,0.18)]"
          : "border-[#E8E9EC]"
      )}
      onClick={() => onSelectTemplate(template.id)}
    >
      <TemplatePreviewStage>
        <LayoutsBadge count={template.layoutCount} />
        <CustomTemplatePreview
          previewLayouts={previewLayouts}
          loading={loading}
          templateId={template.id}
          isOutline={true}
        />
      </TemplatePreviewStage>
      <div
        className="border-t border-[#EDEEEF] bg-white/96 px-6 py-5"
        style={outlineBodyFontStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[#101828]">
              {displayName}
            </h3>
            <p className="mt-1 text-xs text-[#667085]">
              {t("ppt_generator.outline.templates.custom.cardDescription")}
            </p>
          </div>
          {isSelected ? (
            <span className="rounded-full border border-[rgba(0,123,85,0.14)] bg-[rgba(0,123,85,0.08)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b6b4b]">
              {t("ppt_generator.outline.templates.selected")}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
});

