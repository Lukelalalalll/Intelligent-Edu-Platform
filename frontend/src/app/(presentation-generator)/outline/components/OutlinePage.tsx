"use client";

import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FileText, LayoutTemplate, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import Wrapper from "@/components/Wrapper";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import { RootState } from "@/store/store";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
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
    if (!selectedTemplate) return "Not selected";
    if (typeof selectedTemplate === "string") return "Custom template selected";
    return selectedTemplate.name;
  }, [selectedTemplate]);

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

      <Wrapper className={styles.shell}>
        <WelcomeBanner
          title="Outline & Content"
          subtitle="Refine the streamed outline, settle the deck structure, and pick a Presenton template family before generation starts."
          variant="workspace"
          collapseOnScroll
          className={styles.banner}
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className={styles.stage}>
          <div className={styles.tabsRail}>
            <TabsList className={styles.tabsList}>
              <TabsTrigger value={TABS.OUTLINE} className={styles.tabTrigger}>
                Outline & Content
              </TabsTrigger>
              <TabsTrigger value={TABS.LAYOUTS} className={styles.tabTrigger}>
                Select Template
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
                    Deck snapshot
                  </span>
                  <h3 className={styles.sideTitle}>What Presenton will carry forward</h3>
                  <p className={styles.sideDescription}>
                    The streamed outline and your template choice stay paired here,
                    so the presentation step can start without another setup pass.
                  </p>

                  <div className={styles.summaryList}>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Outline status</span>
                      <span className={styles.summaryValue}>
                        {streamState.isStreaming ? streamState.statusMessage : "Ready for generation"}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Slides</span>
                      <span className={styles.summaryValue}>
                        {visibleSlides} total
                        {streamState.activeSlideIndex !== null
                          ? `, slide ${streamState.activeSlideIndex + 1} currently streaming`
                          : ""}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Template</span>
                      <span className={styles.summaryValue}>{templateLabel}</span>
                    </div>
                  </div>
                </section>

                <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
                  <span className={styles.badge}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Motion tune-up
                  </span>
                  <h3 className={styles.sideTitle}>What changed on this screen</h3>
                  <ul className={styles.sideList}>
                    <li className={styles.sideListItem}>
                      Typography now follows the Presenton workspace split between
                      heading and body fonts instead of forcing `Syne` everywhere.
                    </li>
                    <li className={styles.sideListItem}>
                      Live outline updates stay inside the list viewport, and only
                      auto-scroll once the content actually exceeds the panel height.
                    </li>
                    <li className={styles.sideListItem}>
                      Streaming cards keep one stable structure, so content does not
                      flash between raw and formatted layouts while text is arriving.
                    </li>
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
                    Template families
                  </span>
                  <h2 className={styles.sectionTitle}>
                    Match the outline to a Presenton layout system.
                  </h2>
                  <p className={styles.sectionDescription}>
                    Choose a built-in family or reopen a custom template set.
                    The generation step will use that selection to map slides
                    into final layouts.
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
                  {selectedTemplate ? "Template selected" : "Choose template"}
                </span>
                <h3 className={styles.footerTitle}>
                  Generate the final presentation when the outline feels right.
                </h3>
              </div>
              <p className={styles.footerMeta}>
                Presenton will use the current outline order and the selected
                template family to build the full deck.
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
