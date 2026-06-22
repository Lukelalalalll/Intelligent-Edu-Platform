"use client";

import React, { memo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CustomTemplates,
  useCustomTemplatePreview,
} from "@/app/hooks/useCustomTemplates";
import {
  TemplatePreviewStage,
  LayoutsBadge,
  CustomTemplatePreview,
} from "../../components/TemplatePreviewComponents";

export const CustomTemplateCard = memo(function CustomTemplateCard({
  template,
  onSelectTemplate,
  selectedTemplate,
}: {
  template: CustomTemplates;
  onSelectTemplate: (template: string) => void;
  selectedTemplate: string | null;
}) {
  const { previewLayouts, loading } = useCustomTemplatePreview(template.id);
  const isSelected = selectedTemplate === template.id;

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
      <div className="border-t border-[#EDEEEF] bg-white/96 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-instrument_sans text-sm font-semibold text-[#101828]">
              {template.name}
            </h3>
            <p className="mt-1 text-xs text-[#667085]">
              Saved custom layout set ready for Presenton generation.
            </p>
          </div>
          {isSelected ? (
            <span className="rounded-full border border-[rgba(0,123,85,0.14)] bg-[rgba(0,123,85,0.08)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b6b4b]">
              Selected
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
});
