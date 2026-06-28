"use client";

import React from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import { usePageEntrance } from "@/shared/page-entrance/usePageEntrance";

import {
    TemplatePanelControls,
    TemplatePanelLibrary,
    TemplatePanelNavigation,
} from "./TemplatePanelSections";
import { useTemplatePanelController } from "./useTemplatePanelController";
import styles from "./TemplatePanel.module.css";

export default function TemplatePanel() {
    const { t } = useI18n();
    const isEntranceActive = usePageEntrance();
    const { pathname, libraryState, actions } = useTemplatePanelController();
    const { tab, activeTabDescription, stats, sectionCopy, builtIn, custom } = libraryState;
    const {
        handleCreateTemplateClick,
        handleOpenBuiltInPreview,
        handleOpenCustomTemplate,
        handleTabChange,
    } = actions;

    return (
        <div className={styles.page}>
            <div
                className={cn(
                    styles.container,
                    entranceStyles.workspaceEntrance,
                    isEntranceActive && entranceStyles.workspaceEntranceActive,
                )}
            >
                <WelcomeBanner
                    title={t("ppt_generator.templates.banner.title")}
                    subtitle={t("ppt_generator.templates.banner.subtitle")}
                    variant="workspace"
                    className={styles.banner}
                />

                <TemplatePanelNavigation pathname={pathname} />
                <TemplatePanelControls
                    tab={tab}
                    activeTabDescription={activeTabDescription}
                    stats={stats}
                    onCreateTemplateClick={handleCreateTemplateClick}
                    onTabChange={handleTabChange}
                />
                <TemplatePanelLibrary
                    tab={tab}
                    sectionCopy={sectionCopy}
                    builtIn={builtIn}
                    custom={custom}
                    onOpenBuiltInPreview={handleOpenBuiltInPreview}
                    onOpenCustomTemplate={handleOpenCustomTemplate}
                />
            </div>
        </div>
    );
}

