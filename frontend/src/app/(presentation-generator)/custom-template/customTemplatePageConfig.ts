import React from "react";
import {
  CheckCircle2,
  FileCog,
  Images,
  Save,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";

import type { PptGeneratorStep } from "@/features/slides/components/PptGeneratorShell";
import type { TranslationKey } from "@/shared/i18n";

import type { TemplateCreationStep } from "./types";

export type CustomTemplateToolbarConfig = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onAction?: () => void;
  meta?: string;
};

type StepLabelConfig = {
  key: TemplateCreationStep | "font-check-group";
  label: string;
  icon: React.ReactNode;
};

type ToolbarConfigArgs = {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  step: TemplateCreationStep;
  hasFile: boolean;
  fontCount: number;
  missingFontCount: number;
  previewCount: number;
  totalSlides: number;
  completedSlides: number;
  allFontsResolved: boolean;
  hasProcessedSlides: boolean;
  isSavingLayout: boolean;
  isProcessingSlides: boolean;
  onCheckFonts: () => void;
  onContinueFonts: () => Promise<void>;
  onGenerateTemplate: () => Promise<unknown>;
  onOpenSaveModal: () => void;
  fileName?: string;
};

const icon = (Icon: React.ComponentType<{ className?: string }>) =>
  React.createElement(Icon, { className: "h-4 w-4" });

export function getCustomTemplateStepLabels(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): StepLabelConfig[] {
  return [
    { key: "file-upload", label: t("ppt_generator.customTemplate.step.upload"), icon: icon(Upload) },
    { key: "font-check-group", label: t("ppt_generator.customTemplate.step.fonts"), icon: icon(Type) },
    { key: "slides-preview", label: t("ppt_generator.customTemplate.step.preview"), icon: icon(Images) },
    { key: "template-creation", label: t("ppt_generator.customTemplate.step.generate"), icon: icon(Sparkles) },
    { key: "completed", label: t("ppt_generator.customTemplate.step.done"), icon: icon(CheckCircle2) },
  ];
}

export function getCustomTemplateShellSteps(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): PptGeneratorStep[] {
  return getCustomTemplateStepLabels(t).map((step) => ({
    key: String(step.key),
    label: step.label,
    icon: step.icon,
    isClickable: false,
  }));
}

export function mapTemplateStateToShellStep(step: TemplateCreationStep): number {
  const stepKeys: Array<TemplateCreationStep | "font-check-group"> = [
    "file-upload",
    "font-check-group",
    "slides-preview",
    "template-creation",
    "completed",
  ];

  if (step === "font-check" || step === "font-upload") {
    return 1;
  }

  return Math.max(stepKeys.findIndex((item) => item === step), 0);
}

export function buildCustomTemplateToolbarConfig({
  t,
  step,
  hasFile,
  fontCount,
  missingFontCount,
  previewCount,
  totalSlides,
  completedSlides,
  allFontsResolved,
  hasProcessedSlides,
  isSavingLayout,
  isProcessingSlides,
  onCheckFonts,
  onContinueFonts,
  onGenerateTemplate,
  onOpenSaveModal,
  fileName,
}: ToolbarConfigArgs): CustomTemplateToolbarConfig {
  if (step === "file-upload") {
    return {
      eyebrow: t("ppt_generator.customTemplate.toolbar.file.eyebrow"),
      title: t("ppt_generator.customTemplate.toolbar.file.title"),
      description: t("ppt_generator.customTemplate.toolbar.file.body"),
      actionLabel: hasFile
        ? t("ppt_generator.customTemplate.toolbar.file.actionReady")
        : t("ppt_generator.customTemplate.toolbar.file.actionSelect"),
      actionIcon: icon(FileCog),
      actionDisabled: !hasFile,
      onAction: onCheckFonts,
      meta: fileName
        ? t("ppt_generator.customTemplate.toolbar.file.metaFile", { name: fileName })
        : t("ppt_generator.customTemplate.toolbar.file.metaDefault"),
    };
  }

  if (step === "font-check" || step === "font-upload") {
    return {
      eyebrow: t("ppt_generator.customTemplate.toolbar.font.eyebrow"),
      title: t("ppt_generator.customTemplate.toolbar.font.title"),
      description: t("ppt_generator.customTemplate.toolbar.font.body"),
      actionLabel: allFontsResolved
        ? t("ppt_generator.customTemplate.toolbar.font.actionReady")
        : t("ppt_generator.customTemplate.toolbar.font.actionContinue"),
      actionIcon: icon(Type),
      actionDisabled: !allFontsResolved,
      actionLoading: step === "font-upload",
      onAction: () => {
        void onContinueFonts();
      },
      meta:
        missingFontCount > 0
          ? t("ppt_generator.customTemplate.toolbar.font.metaMissing", { count: missingFontCount })
          : t("ppt_generator.customTemplate.toolbar.font.metaReady", { count: fontCount }),
    };
  }

  if (step === "slides-preview") {
    return {
      eyebrow: t("ppt_generator.customTemplate.toolbar.preview.eyebrow"),
      title: t("ppt_generator.customTemplate.toolbar.preview.title"),
      description: t("ppt_generator.customTemplate.toolbar.preview.body"),
      actionLabel: t("ppt_generator.customTemplate.toolbar.preview.action"),
      actionIcon: icon(Sparkles),
      actionDisabled: previewCount === 0,
      onAction: () => {
        void onGenerateTemplate();
      },
      meta: t("ppt_generator.customTemplate.toolbar.preview.meta", { count: previewCount }),
    };
  }

  if (step === "template-creation") {
    return {
      eyebrow: t("ppt_generator.customTemplate.toolbar.generation.eyebrow"),
      title: t("ppt_generator.customTemplate.toolbar.generation.title"),
      description: t("ppt_generator.customTemplate.toolbar.generation.body"),
      meta:
        totalSlides > 0
          ? t("ppt_generator.customTemplate.toolbar.generation.metaReady", {
              done: completedSlides,
              total: totalSlides,
            })
          : t("ppt_generator.customTemplate.toolbar.generation.metaPreparing"),
    };
  }

  return {
    eyebrow: t("ppt_generator.customTemplate.toolbar.save.eyebrow"),
    title: t("ppt_generator.customTemplate.toolbar.save.title"),
    description: t("ppt_generator.customTemplate.toolbar.save.body"),
    actionLabel: t("ppt_generator.customTemplate.toolbar.save.action"),
    actionIcon: icon(Save),
    actionDisabled: !hasProcessedSlides || isProcessingSlides,
    actionLoading: isSavingLayout,
    onAction: onOpenSaveModal,
    meta:
      totalSlides > 0
        ? t("ppt_generator.customTemplate.toolbar.save.metaReady", {
            done: completedSlides,
            total: totalSlides,
          })
        : t("ppt_generator.customTemplate.toolbar.save.metaLayouts"),
  };
}

