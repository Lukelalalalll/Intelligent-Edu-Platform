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

export const CUSTOM_TEMPLATE_STEP_LABELS: StepLabelConfig[] = [
  { key: "file-upload", label: "Upload", icon: icon(Upload) },
  { key: "font-check-group", label: "Fonts", icon: icon(Type) },
  { key: "slides-preview", label: "Preview", icon: icon(Images) },
  { key: "template-creation", label: "Generate", icon: icon(Sparkles) },
  { key: "completed", label: "Done", icon: icon(CheckCircle2) },
];

export const CUSTOM_TEMPLATE_SHELL_STEPS: PptGeneratorStep[] = CUSTOM_TEMPLATE_STEP_LABELS.map(
  (step) => ({
    key: String(step.key),
    label: step.label,
    icon: step.icon,
    isClickable: false,
  })
);

export function mapTemplateStateToShellStep(step: TemplateCreationStep): number {
  if (step === "font-check" || step === "font-upload") {
    return 1;
  }

  return Math.max(
    CUSTOM_TEMPLATE_STEP_LABELS.findIndex((item) => item.key === step),
    0
  );
}

export function buildCustomTemplateToolbarConfig({
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
      eyebrow: "Template Studio",
      title: "Upload a PPTX to build a reusable template family",
      description:
        "Start from an existing slide deck, check font coverage, preview extracted slides, and convert the deck into editable PPT Generator template layouts.",
      actionLabel: hasFile ? "Check Fonts" : "Select a PPTX file",
      actionIcon: icon(FileCog),
      actionDisabled: !hasFile,
      onAction: onCheckFonts,
      meta: fileName
        ? `Current file: ${fileName}`
        : "PPTX only | Max 100MB | Approx. 5 minutes",
    };
  }

  if (step === "font-check" || step === "font-upload") {
    return {
      eyebrow: "Font Validation",
      title: "Verify typefaces before generating slide previews",
      description:
        "PPT Generator compares the uploaded deck against matched fonts so your reconstructed slides stay faithful to the original typography. Resolve every missing entry with either a matched font selection or an uploaded font file before continuing.",
      actionLabel: allFontsResolved
        ? "Continue to Preview"
        : "Resolve All Missing Fonts First",
      actionIcon: icon(Type),
      actionDisabled: !allFontsResolved,
      actionLoading: step === "font-upload",
      onAction: () => {
        void onContinueFonts();
      },
      meta:
        missingFontCount > 0
          ? `${missingFontCount} missing font${missingFontCount === 1 ? "" : "s"} still unresolved`
          : `${fontCount} font source${fontCount === 1 ? "" : "s"} ready for preview`,
    };
  }

  if (step === "slides-preview") {
    return {
      eyebrow: "Preview Slides",
      title: "Review extracted slides before layout reconstruction",
      description:
        "Check image fidelity, confirm fonts loaded correctly, and then convert each slide into a reusable React template.",
      actionLabel: "Generate Template",
      actionIcon: icon(Sparkles),
      actionDisabled: previewCount === 0,
      onAction: () => {
        void onGenerateTemplate();
      },
      meta: `${previewCount} slide preview${previewCount === 1 ? "" : "s"} ready`,
    };
  }

  if (step === "template-creation") {
    return {
      eyebrow: "Generation Workspace",
      title: "Reconstruct each slide into editable template code",
      description:
        "Monitor generation, inspect individual slide layouts, and open schema editing on the right when you need to tighten structure or content slots.",
      meta:
        totalSlides > 0
          ? `${completedSlides}/${totalSlides} slides completed`
          : "Preparing slide generation",
    };
  }

  return {
    eyebrow: "Save Template",
    title: "Template reconstruction complete",
    description:
      "Review the finished layouts, make any last schema adjustments, and save the result as a reusable custom PPT Generator template.",
    actionLabel: "Save Template",
    actionIcon: icon(Save),
    actionDisabled: !hasProcessedSlides || isProcessingSlides,
    actionLoading: isSavingLayout,
    onAction: onOpenSaveModal,
    meta:
      totalSlides > 0
        ? `${completedSlides}/${totalSlides} slides ready to package`
        : "Layouts ready",
  };
}

