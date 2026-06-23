"use client";

import React from "react";

import { OverlayLoader } from "@/components/ui/overlay-loader";
import WelcomeBanner from "@/shared/components/WelcomeBanner";

import {
  UploadInputSection,
  UploadSetupSection,
} from "./UploadPageSections";
import { useUploadPageController } from "./useUploadPageController";
import styles from "./UploadPage.module.css";

const UploadPage = () => {
  const { config, files, loadingState, viewState, actions } =
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
      <div className={styles.container}>
        <WelcomeBanner
          className={styles.banner}
          title="Generate a Presentation"
          subtitle="Start with a concise brief or a few supporting files, then refine the outline before the full deck is generated."
          variant="workspace"
        />

        <div className={styles.workspaceGrid}>
          <UploadInputSection
            files={files}
            prompt={config.prompt}
            onFilesChange={actions.handleFilesChange}
            onPromptChange={(value) => actions.handleConfigChange("prompt", value)}
          />
          <UploadSetupSection
            actionSummary={viewState.actionSummary}
            config={config}
            isLoading={loadingState.isLoading}
            primaryActionLabel={viewState.primaryActionLabel}
            statusCards={viewState.statusCards}
            onConfigChange={actions.handleConfigChange}
            onGeneratePresentation={actions.handleGeneratePresentation}
          />
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
