"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";

import PptGeneratorShell from "@/features/slides/components/PptGeneratorShell";
import { useI18n } from "@/shared/i18n";
import { CustomTemplateShellToolbar } from "./components/CustomTemplateShellToolbar";
import { SaveLayoutModal } from "./components/SaveLayoutModal";
import { FileUploadSection } from "./components/FileUploadSection";
import { Step2FontManagement } from "./components/steps/Step2FontManagement";
import { Step3SlidePreview } from "./components/steps/Step3SlidePreview";
import { Step4TemplateCreation } from "./components/steps/Step4TemplateCreation";
import { useCustomTemplatePageController } from "./hooks/useCustomTemplatePageController";
import styles from "./customTemplateWorkbench.module.css";

const CustomTemplatePage = () => {
  const { t } = useI18n();
  const controller = useCustomTemplatePageController();

  return (
    <PptGeneratorShell
      currentStep={controller.shell.currentStep}
      steps={controller.shell.steps}
      compactStepper
      stepperLeading={
        <button
          type="button"
          className={styles.railBackButton}
          onClick={controller.shell.onBackToTemplates}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("ppt_generator.customTemplate.page.back")}
        </button>
      }
      className={styles.shell}
      contentClassName={styles.page}
      bannerTitle={t("ppt_generator.customTemplate.page.title")}
      bannerSubtitle={t("ppt_generator.customTemplate.page.subtitle")}
      toolbar={<CustomTemplateShellToolbar toolbar={controller.shell.toolbar} />}
    >
      {controller.flow.showFileUpload ? (
        <FileUploadSection {...controller.fileUploadStepProps} />
      ) : null}

      {controller.flow.showFontManager && (
        <Step2FontManagement {...controller.fontManagementStepProps} />
      )}

      {controller.flow.showPreview && <Step3SlidePreview {...controller.slidePreviewStepProps} />}

      {controller.flow.showSlides && (
        <Step4TemplateCreation {...controller.templateCreationStepProps} />
      )}

      <SaveLayoutModal {...controller.saveLayoutModalProps} />
    </PptGeneratorShell>
  );
};

export default CustomTemplatePage;
