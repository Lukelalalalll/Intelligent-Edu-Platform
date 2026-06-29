"use client";

import React from "react";
import { useRouter } from "@/ppt_generator/shims/next-navigation";

import { OverlayLoader } from "@/components/ui/overlay-loader";
import { cn } from "@/lib/utils";
import PptGeneratorWorkflowStepper from "@/ppt_generator/components/PptGeneratorWorkflowStepper";
import { useI18n } from "@/shared/i18n";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import { usePageEntrance } from "@/shared/page-entrance/usePageEntrance";

import {
  UploadInputSection,
  UploadSetupSection,
} from "./UploadPageSections";
import { useUploadPageController } from "./useUploadPageController";
import styles from "./UploadPage.module.css";

const UploadPage = () => {
  const isEntranceActive = usePageEntrance();
  const router = useRouter();
  const { t } = useI18n();
  const { config, files, llmConfig, loadingState, viewState, actions } =
    useUploadPageController();

  return (
    <div className={styles.page}>
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
        extra_info={loadingState.extra_info}
      />
      <div
        className={cn(
          styles.container
        )}
      >
        <WelcomeBanner
          className={cn(
            styles.banner,
            entranceStyles.pageEntrance,
            isEntranceActive && entranceStyles.pageEntranceActive,
            styles.bannerEntrance
          )}
          title={t("ppt_generator.upload.banner.title")}
          subtitle={t("ppt_generator.upload.banner.subtitle")}
          variant="workspace"
        />

        <PptGeneratorWorkflowStepper
          activeStep="prepare"
          onBack={() => router.push("/dashboard")}
          className={cn(
            entranceStyles.pageEntrance,
            isEntranceActive && entranceStyles.pageEntranceActive,
            styles.stepperEntrance
          )}
        />

        <div
          className={cn(
            styles.workspaceGrid,
            entranceStyles.pageEntrance,
            isEntranceActive && entranceStyles.pageEntranceActive,
            styles.workspaceEntrance
          )}
        >
          <UploadInputSection
            files={files}
            prompt={config.prompt}
            onFilesChange={actions.handleFilesChange}
            onPromptChange={(value) => actions.handleConfigChange("prompt", value)}
          />
          <UploadSetupSection
            actionSummary={viewState.actionSummary}
            config={config}
            generationDisabledReason={viewState.generationDisabledReason}
            isLoading={loadingState.isLoading}
            llmConfig={llmConfig}
            providerCards={viewState.providerCards}
            primaryActionLabel={viewState.primaryActionLabel}
            selectedProvider={viewState.selectedProvider}
            statusCards={viewState.statusCards}
            onConfigChange={actions.handleConfigChange}
            onGeneratePresentation={actions.handleGeneratePresentation}
            onProviderSelect={actions.handleProviderSelect}
          />
        </div>
      </div>
    </div>
  );
};

export default UploadPage;

