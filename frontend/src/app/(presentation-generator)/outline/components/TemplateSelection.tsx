"use client";

import React, { memo, useCallback, useMemo } from "react";
import { Loader2, LayoutTemplate, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/shared/i18n";
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

const outlineBodyFontStyle = {
  fontFamily: "var(--outline-body-font, var(--body-font-family, inherit))",
} as const;

const BUILT_IN_TEMPLATE_COPY: Partial<
  Record<
    string,
    {
      name: TranslationKey;
      description: TranslationKey;
    }
  >
> = {
  general: {
    name: "ppt_generator.templates.family.general.name",
    description: "ppt_generator.templates.family.general.description",
  },
  modern: {
    name: "ppt_generator.templates.family.modern.name",
    description: "ppt_generator.templates.family.modern.description",
  },
  standard: {
    name: "ppt_generator.templates.family.standard.name",
    description: "ppt_generator.templates.family.standard.description",
  },
  swift: {
    name: "ppt_generator.templates.family.swift.name",
    description: "ppt_generator.templates.family.swift.description",
  },
  code: {
    name: "ppt_generator.templates.family.code.name",
    description: "ppt_generator.templates.family.code.description",
  },
  education: {
    name: "ppt_generator.templates.family.education.name",
    description: "ppt_generator.templates.family.education.description",
  },
  "product-overview": {
    name: "ppt_generator.templates.family.productOverview.name",
    description: "ppt_generator.templates.family.productOverview.description",
  },
  report: {
    name: "ppt_generator.templates.family.report.name",
    description: "ppt_generator.templates.family.report.description",
  },
  "pitch-deck": {
    name: "ppt_generator.templates.family.pitchDeck.name",
    description: "ppt_generator.templates.family.pitchDeck.description",
  },
  "neo-general": {
    name: "ppt_generator.templates.family.neoGeneral.name",
    description: "ppt_generator.templates.family.neoGeneral.description",
  },
  "neo-standard": {
    name: "ppt_generator.templates.family.neoStandard.name",
    description: "ppt_generator.templates.family.neoStandard.description",
  },
  "neo-modern": {
    name: "ppt_generator.templates.family.neoModern.name",
    description: "ppt_generator.templates.family.neoModern.description",
  },
  "neo-swift": {
    name: "ppt_generator.templates.family.neoSwift.name",
    description: "ppt_generator.templates.family.neoSwift.description",
  },
};

const BuiltInTemplateCard = memo(function BuiltInTemplateCard({
  template,
  title,
  description,
  selectedLabel,
  isSelected,
  onSelect,
}: {
  template: TemplateLayoutsWithSettings;
  title: string;
  description: string;
  selectedLabel: string;
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
      <div
        className="border-t border-[#EDEEEF] bg-white/96 px-6 py-5"
        style={outlineBodyFontStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold capitalize text-[#101828]">
              {title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#667085]">
              {description}
            </p>
          </div>
          {isSelected ? (
            <span className="rounded-full border border-[rgba(0,123,85,0.14)] bg-[rgba(0,123,85,0.08)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b6b4b]">
              {selectedLabel}
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
  const { t } = useI18n();
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
          <p className={styles.loadingText}>
            {t("ppt_generator.outline.templates.loadingCustom")}
          </p>
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
  }, [customLoading, customTemplates, handleCustomSelect, selectedCustomId, t]);

  const builtInTemplateCards = useMemo(
    () =>
      templates.map((template: TemplateLayoutsWithSettings) => (
        <BuiltInTemplateCard
          key={template.id}
          template={template}
          title={
            BUILT_IN_TEMPLATE_COPY[template.id]
              ? t(BUILT_IN_TEMPLATE_COPY[template.id]!.name)
              : template.name
          }
          description={
            BUILT_IN_TEMPLATE_COPY[template.id]
              ? t(BUILT_IN_TEMPLATE_COPY[template.id]!.description)
              : template.description
          }
          selectedLabel={t("ppt_generator.outline.templates.selected")}
          isSelected={selectedBuiltInId === template.id}
          onSelect={handleBuiltInSelect}
        />
      )),
    [handleBuiltInSelect, selectedBuiltInId, t]
  );

  return (
    <div className={styles.templateSection}>
      <section className={styles.templateGroup}>
        <div className={styles.groupHeader}>
          <div className={styles.controlCopy}>
            <span className={styles.badge}>
              <Sparkles className="h-3.5 w-3.5" />
              {t("ppt_generator.outline.templates.custom.badge")}
            </span>
            <h3 className={styles.groupTitle}>
              {t("ppt_generator.outline.templates.custom.title")}
            </h3>
            <p className={styles.groupDescription}>
              {t("ppt_generator.outline.templates.custom.body")}
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
              {t("ppt_generator.outline.templates.builtIn.badge")}
            </span>
            <h3 className={styles.groupTitle}>
              {t("ppt_generator.outline.templates.builtIn.title")}
            </h3>
            <p className={styles.groupDescription}>
              {t("ppt_generator.outline.templates.builtIn.body")}
            </p>
          </div>
        </div>
        <div className={styles.templateGrid}>{builtInTemplateCards}</div>
      </section>
    </div>
  );
});

export default TemplateSelection;

