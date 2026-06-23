"use client";

import React from "react";

import WelcomeBanner from "@/shared/components/WelcomeBanner";

import {
    TemplatePanelControls,
    TemplatePanelLibrary,
    TemplatePanelNavigation,
} from "./TemplatePanelSections";
import { useTemplatePanelController } from "./useTemplatePanelController";
import styles from "./TemplatePanel.module.css";

export default function TemplatePanel() {
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
            <div className={styles.container}>
                <WelcomeBanner
                    title="Templates"
                    subtitle="Browse built-in families, reopen custom work, and move into preview from a calmer Presenton workspace."
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
