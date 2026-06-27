"use client";

import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FileText, LayoutTemplate, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import Wrapper from "@/components/Wrapper";
import { cn } from "@/lib/utils";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import { usePageEntrance } from "@/shared/page-entrance/usePageEntrance";
import { RootState } from "@/store/store";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { useI18n } from "@/shared/i18n";
import OutlineContent from "./OutlineContent";
import EmptyStateView from "./EmptyStateView";
import GenerateButton from "./GenerateButton";
import TemplateSelection from "./TemplateSelection";
import { TABS } from "../types/index";
import { useOutlineStreaming } from "../hooks/useOutlineStreaming";
import { useOutlineManagement } from "../hooks/useOutlineManagement";
import { usePresentationGeneration } from "../hooks/usePresentationGeneration";
import styles from "./OutlineWorkspace.module.css";

const OutlinePage: React.FC = () => {
  const { t } = useI18n();
  const isEntranceActive = usePageEntrance();
  const { presentation_id } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  const [activeTab, setActiveTab] = useState<string>(TABS.OUTLINE);
  const [selectedTemplate, setSelectedTemplate] = useState<
    TemplateLayoutsWithSettings | string | null
  >(null);

  const streamState = useOutlineStreaming(presentation_id);
  const activeOutlines = streamState.displayOutlines;
  const {
    handleDragEnd,
    handleAddSlide,
    handleUpdateSlide,
    handleDeleteSlide,
  } = useOutlineManagement(activeOutlines);
  const { loadingState, handleSubmit } = usePresentationGeneration(
    presentation_id,
    activeOutlines,
    selectedTemplate,
    setActiveTab
  );

  const visibleSlides = activeOutlines?.length ?? 0;

  const templateLabel = useMemo(() => {
    if (!selectedTemplate) return t("presenton.outline.summary.template.none");
    if (typeof selectedTemplate === "string") return t("presenton.outline.summary.template.custom");
    return selectedTemplate.name;
  }, [selectedTemplate, t]);

  if (!presentation_id) {
    return <EmptyStateView />;
  }

  const handleTabChange = (tab: string) => {
    if (streamState.isStreaming) {
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className={styles.page}>
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
      />

      <Wrapper
        className={cn(
          styles.shell,
          entranceStyles.pageEntrance,
          isEntranceActive && entranceStyles.pageEntranceActive
        )}
      >
        <WelcomeBanner
          title={t("presenton.outline.banner.title")}
          subtitle={t("presenton.outline.banner.subtitle")}
          variant="workspace"
          className={styles.banner}
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className={styles.stage}>
          <div className={styles.tabsRail}>
            <TabsList className={styles.tabsList}>
              <TabsTrigger value={TABS.OUTLINE} className={styles.tabTrigger}>
                {t("presenton.outline.tabs.outline")}
              </TabsTrigger>
              <TabsTrigger value={TABS.LAYOUTS} className={styles.tabTrigger}>
                {t("presenton.outline.tabs.layouts")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={TABS.OUTLINE} className={styles.tabPanel}>
            <div className={styles.workspaceGrid}>
              <div className={styles.mainColumn}>
                <OutlineContent
                  outlines={activeOutlines}
                  isLoading={streamState.isLoading}
                  isStreaming={streamState.isStreaming}
                  activeSlideIndex={streamState.activeSlideIndex}
                  highestActiveIndex={streamState.highestActiveIndex}
                  statusMessage={streamState.statusMessage}
                  onDragEnd={handleDragEnd}
                  onAddSlide={handleAddSlide}
                  onUpdateSlide={handleUpdateSlide}
                  onDeleteSlide={handleDeleteSlide}
                />
              </div>

              <aside className={styles.sideColumn}>
                <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
                  <span className={styles.mutedBadge}>
                    <FileText className="h-3.5 w-3.5" />
                    {t("presenton.outline.summary.badge")}
                  </span>
                  <h3 className={styles.sideTitle}>{t("presenton.outline.summary.title")}</h3>
                  <p className={styles.sideDescription}>
                    {t("presenton.outline.summary.body")}
                  </p>

                  <div className={styles.summaryList}>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{t("presenton.outline.summary.status")}</span>
                      <span className={styles.summaryValue}>
                        {streamState.isStreaming ? streamState.statusMessage : t("presenton.outline.summary.status.ready")}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{t("presenton.outline.summary.slides")}</span>
                      <span className={styles.summaryValue}>
                        {t("presenton.outline.summary.slidesCount", { count: visibleSlides })}
                        {streamState.activeSlideIndex !== null
                          ? t("presenton.outline.summary.streamingSlide", {
                              count: streamState.activeSlideIndex + 1,
                            })
                          : ""}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{t("presenton.outline.summary.template")}</span>
                      <span className={styles.summaryValue}>{templateLabel}</span>
                    </div>
                  </div>
                </section>

                <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
                  <span className={styles.badge}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("presenton.outline.tuneup.badge")}
                  </span>
                  <h3 className={styles.sideTitle}>{t("presenton.outline.tuneup.title")}</h3>
                  <ul className={styles.sideList}>
                    <li className={styles.sideListItem}>{t("presenton.outline.tuneup.item1")}</li>
                    <li className={styles.sideListItem}>{t("presenton.outline.tuneup.item2")}</li>
                    <li className={styles.sideListItem}>{t("presenton.outline.tuneup.item3")}</li>
                  </ul>
                </section>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value={TABS.LAYOUTS} className={styles.tabPanel}>
            <section className={`${styles.surfaceCard} ${styles.contentCard} ${styles.fullWidthPanel}`}>
              <div className={styles.groupHeader}>
                <div className={styles.controlCopy}>
                  <span className={styles.badge}>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    {t("presenton.outline.layouts.badge")}
                  </span>
                  <h2 className={styles.sectionTitle}>
                    {t("presenton.outline.layouts.title")}
                  </h2>
                  <p className={styles.sectionDescription}>
                    {t("presenton.outline.layouts.body")}
                  </p>
                </div>
              </div>
              <TemplateSelection
                selectedTemplate={selectedTemplate}
                onSelectTemplate={setSelectedTemplate}
              />
            </section>
          </TabsContent>
        </Tabs>

        <div className={styles.footerBar}>
          <div className={`${styles.surfaceCard} ${styles.footerInner}`}>
            <div className={styles.footerCopy}>
              <div className={styles.footerTop}>
                <span className={styles.footerBadge}>
                  {selectedTemplate
                    ? t("presenton.outline.footer.badge.selected")
                    : t("presenton.outline.footer.badge.unselected")}
                </span>
                <h3 className={styles.footerTitle}>
                  {t("presenton.outline.footer.title")}
                </h3>
              </div>
              <p className={styles.footerMeta}>
                {t("presenton.outline.footer.body")}
              </p>
            </div>
            <div className={styles.footerAction}>
              <GenerateButton
                loadingState={loadingState}
                streamState={streamState}
                selectedTemplate={selectedTemplate}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </div>
      </Wrapper>
    </div>
  );
};

export default OutlinePage;
