"use client";

import React, { memo, useCallback, useMemo } from "react";
import { Loader2, LayoutTemplate, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { templates } from "@/app/presentation-templates";
import {
  CustomTemplates,
  useCustomTemplateSummaries,
} from "@/app/hooks/useCustomTemplates";
import CreateCustomTemplate from "../../(workspace)/templates/components/CreateCustomTemplate";
import { CustomTemplateCard } from "./CustomTemplateCard";
import {
  InbuiltTemplatePreview,
  LayoutsBadge,
  TemplatePreviewStage,
} from "../../components/TemplatePreviewComponents";
import styles from "./OutlineWorkspace.module.css";

const BuiltInTemplateCard = memo(function BuiltInTemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: TemplateLayoutsWithSettings;
  isSelected: boolean;
  onSelect: (template: TemplateLayoutsWithSettings) => void;
}) {
  const handleClick = useCallback(() => onSelect(template), [onSelect, template]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "overflow-hidden rounded-[22px] border bg-white/94 text-left shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_32px_-24px_rgba(0,123,85,0.22)]",
        isSelected
          ? "border-[rgba(0,123,85,0.28)] ring-2 ring-[rgba(0,123,85,0.18)]"
          : "border-[#E8E9EC]"
      )}
    >
      <TemplatePreviewStage>
        <LayoutsBadge count={template.layouts.length} />
        <InbuiltTemplatePreview
          layouts={template.layouts}
          templateId={template.id}
          isOutline={true}
        />
      </TemplatePreviewStage>
      <div className="border-t border-[#EDEEEF] bg-white/96 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-instrument_sans text-sm font-semibold capitalize text-[#101828]">
              {template.name}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#667085]">
              {template.description}
            </p>
          </div>
          {isSelected ? (
            <span className="rounded-full border border-[rgba(0,123,85,0.14)] bg-[rgba(0,123,85,0.08)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b6b4b]">
              Selected
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
});

interface TemplateSelectionProps {
  selectedTemplate: TemplateLayoutsWithSettings | string | null;
  onSelectTemplate: (template: TemplateLayoutsWithSettings | string) => void;
}

const TemplateSelection: React.FC<TemplateSelectionProps> = memo(function TemplateSelection({
  selectedTemplate,
  onSelectTemplate,
}) {
  const { templates: customTemplates, loading: customLoading } =
    useCustomTemplateSummaries();

  const handleCustomSelect = useCallback(
    (template: TemplateLayoutsWithSettings | string) => onSelectTemplate(template),
    [onSelectTemplate]
  );

  const handleBuiltInSelect = useCallback(
    (template: TemplateLayoutsWithSettings) => onSelectTemplate(template),
    [onSelectTemplate]
  );

  const selectedCustomId = useMemo(
    () => (typeof selectedTemplate === "string" ? selectedTemplate : null),
    [selectedTemplate]
  );

  const selectedBuiltInId = useMemo(
    () => (typeof selectedTemplate !== "string" ? selectedTemplate?.id ?? null : null),
    [selectedTemplate]
  );

  const customTemplateCards = useMemo(() => {
    if (customLoading) {
      return (
        <div className={styles.loadingState}>
          <Loader2 className="h-8 w-8 animate-spin text-[#0b6b4b]" />
          <p className={styles.loadingText}>Loading custom template previews...</p>
        </div>
      );
    }

    return (
      <div className={styles.templateGrid}>
        <CreateCustomTemplate variant="workspace" />
        {customTemplates.map((template: CustomTemplates) => (
          <CustomTemplateCard
            key={template.id}
            template={template}
            onSelectTemplate={handleCustomSelect}
            selectedTemplate={selectedCustomId}
          />
        ))}
      </div>
    );
  }, [customLoading, customTemplates, handleCustomSelect, selectedCustomId]);

  const builtInTemplateCards = useMemo(
    () =>
      templates.map((template: TemplateLayoutsWithSettings) => (
        <BuiltInTemplateCard
          key={template.id}
          template={template}
          isSelected={selectedBuiltInId === template.id}
          onSelect={handleBuiltInSelect}
        />
      )),
    [handleBuiltInSelect, selectedBuiltInId]
  );

  return (
    <div className={styles.templateSection}>
      <section className={styles.templateGroup}>
        <div className={styles.groupHeader}>
          <div className={styles.controlCopy}>
            <span className={styles.badge}>
              <Sparkles className="h-3.5 w-3.5" />
              Custom families
            </span>
            <h3 className={styles.groupTitle}>Custom templates</h3>
            <p className={styles.groupDescription}>
              Reopen a saved custom layout set or build a new one without leaving the
              Presenton workspace.
            </p>
          </div>
        </div>
        {customTemplateCards}
      </section>

      <section className={styles.templateGroup}>
        <div className={styles.groupHeader}>
          <div className={styles.controlCopy}>
            <span className={styles.mutedBadge}>
              <LayoutTemplate className="h-3.5 w-3.5" />
              Built-in families
            </span>
            <h3 className={styles.groupTitle}>Presenton built-ins</h3>
            <p className={styles.groupDescription}>
              Pick the family whose pacing and layout coverage best fits this outline.
            </p>
          </div>
        </div>
        <div className={styles.templateGrid}>{builtInTemplateCards}</div>
      </section>
    </div>
  );
});

export default TemplateSelection;
