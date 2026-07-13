"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "@/ppt_generator/shims/next-navigation";
import { useSelector } from "react-redux";
import { ChevronRight, FileText, LayoutTemplate, Sparkles } from "lucide-react";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PptGeneratorWorkflowStepper from "@/ppt_generator/components/PptGeneratorWorkflowStepper";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import { RootState } from "@/store/store";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { useI18n } from "@/shared/i18n";
import OutlineContent from "./OutlineContent";
import EmptyStateView from "./EmptyStateView";
import GenerateButton from "./GenerateButton";
import TemplateSelection from "./TemplateSelection";
import { useOutlineStreaming } from "../hooks/useOutlineStreaming";
import { useOutlineManagement } from "../hooks/useOutlineManagement";
import { usePresentationGeneration } from "../hooks/usePresentationGeneration";
import styles from "./OutlineWorkspace.module.css";

type OutlineStage = "outline" | "templates";

const OutlinePage: React.FC = () => {
  const { t } = useI18n();
  const router = useRouter();
  const { presentation_id } = useSelector(
    (state: RootState) => state.presentationGeneration
  );
  const uploadFiles = useSelector((state: RootState) => state.pptGenUpload.files);

  const [activeStage, setActiveStage] = useState<OutlineStage>("outline");
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
    () => setActiveStage("templates")
  );

  const visibleSlides = activeOutlines?.length ?? 0;

  const templateLabel = useMemo(() => {
    if (!selectedTemplate) return t("ppt_generator.outline.summary.template.none");
    if (typeof selectedTemplate === "string") return t("ppt_generator.outline.summary.template.custom");
    return selectedTemplate.name;
  }, [selectedTemplate, t]);

  const handleBack = () => {
    if (activeStage === "templates") {
      setActiveStage("outline");
      return;
    }

    if (Array.isArray(uploadFiles) && uploadFiles.length > 0) {
      router.push("/documents-preview");
      return;
    }

    router.push("/upload");
  };

  if (!presentation_id) {
    return <EmptyStateView />;
  }

  return (
    <div className={styles.page}>
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
      />

      <div className={styles.shell}>
        <WelcomeBanner
          title={t("ppt_generator.outline.banner.title")}
          subtitle={t("ppt_generator.outline.banner.subtitle")}
          variant="workspace"
          className={styles.banner}
        />

        <PptGeneratorWorkflowStepper
          activeStep={activeStage}
          onBack={handleBack}
          className={styles.stepper}
          clickableSteps={["outline", "templates"]}
          onStepSelect={(step) => {
            if (step === "outline" || step === "templates") {
              setActiveStage(step);
            }
          }}
        />

        <div
          className={cn(
            styles.stage,
            activeStage === "templates" && styles.stageTemplates
          )}
          data-testid="outline-stage-shell"
        >
          {activeStage === "outline" ? (
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
                <section
                  className={cn(
                    styles.surfaceCard,
                    styles.sideCard,
                    styles.motionCard,
                    styles.motionCardSecondary
                  )}
                >
                  <span className={styles.mutedBadge}>
                    <FileText className="h-3.5 w-3.5" />
                    {t("ppt_generator.outline.summary.badge")}
                  </span>
                  <h3 className={styles.sideTitle}>{t("ppt_generator.outline.summary.title")}</h3>
                  <p className={styles.sideDescription}>
                    {t("ppt_generator.outline.summary.body")}
                  </p>

                  <div className={styles.summaryList}>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{t("ppt_generator.outline.summary.status")}</span>
                      <span className={styles.summaryValue}>
                        {streamState.isStreaming ? streamState.statusMessage : t("ppt_generator.outline.summary.status.ready")}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{t("ppt_generator.outline.summary.slides")}</span>
                      <span className={styles.summaryValue}>
                        {t("ppt_generator.outline.summary.slidesCount", { count: visibleSlides })}
                        {streamState.activeSlideIndex !== null
                          ? t("ppt_generator.outline.summary.streamingSlide", {
                              count: streamState.activeSlideIndex + 1,
                            })
                          : ""}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{t("ppt_generator.outline.summary.template")}</span>
                      <span className={styles.summaryValue}>{templateLabel}</span>
                    </div>
                  </div>
                </section>

                <section
                  className={cn(
                    styles.surfaceCard,
                    styles.sideCard,
                    styles.motionCard,
                    styles.motionCardTertiary
                  )}
                >
                  <span className={styles.badge}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("ppt_generator.outline.tuneup.badge")}
                  </span>
                  <h3 className={styles.sideTitle}>{t("ppt_generator.outline.tuneup.title")}</h3>
                  <ul className={styles.sideList}>
                    <li className={styles.sideListItem}>{t("ppt_generator.outline.tuneup.item1")}</li>
                    <li className={styles.sideListItem}>{t("ppt_generator.outline.tuneup.item2")}</li>
                    <li className={styles.sideListItem}>{t("ppt_generator.outline.tuneup.item3")}</li>
                  </ul>
                </section>

                <section
                  className={cn(
                    styles.surfaceCard,
                    styles.sideCard,
                    styles.flowActionCard,
                    styles.motionCard,
                    styles.motionCardQuaternary
                  )}
                >
                  <span className={styles.badge}>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    {t("ppt_generator.upload.summary.nextStep")}
                  </span>
                  <h3 className={styles.sideTitle}>{t("ppt_generator.outline.tabs.layouts")}</h3>
                  <p className={styles.sideDescription}>
                    {t("ppt_generator.outline.layouts.body")}
                  </p>
                  <Button
                    type="button"
                    className={styles.flowActionButton}
                    onClick={() => setActiveStage("templates")}
                  >
                    <span>{t("ppt_generator.outline.tabs.layouts")}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </section>
              </aside>
            </div>
          ) : (
            <section
              className={cn(
                styles.surfaceCard,
                styles.contentCard,
                styles.fullWidthPanel,
                styles.templateStageCard,
                styles.motionCard,
                styles.motionCardPrimary
              )}
              data-testid="outline-template-stage"
            >
              <div className={cn(styles.groupHeader, styles.templateStageHeader)}>
                <div className={styles.controlCopy}>
                  <span className={styles.badge}>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    {t("ppt_generator.outline.layouts.badge")}
                  </span>
                  <h2 className={styles.sectionTitle}>
                    {t("ppt_generator.outline.layouts.title")}
                  </h2>
                  <p className={styles.sectionDescription}>
                    {t("ppt_generator.outline.layouts.body")}
                  </p>
                </div>
                <div className={styles.templateStageMeta}>
                  <span className={styles.mutedBadge}>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    {t("ppt_generator.outline.tabs.layouts")}
                  </span>
                  <span
                    className={cn(
                      selectedTemplate ? styles.badge : styles.mutedBadge,
                      styles.templateStageSelection
                    )}
                  >
                    {templateLabel}
                  </span>
                </div>
              </div>
              <div className={styles.templateStageBody}>
                <TemplateSelection
                  selectedTemplate={selectedTemplate}
                  onSelectTemplate={setSelectedTemplate}
                />
              </div>
            </section>
          )}
        </div>

        {selectedTemplate ? (
          <div className={styles.footerBar}>
            <div
              className={cn(
                styles.surfaceCard,
                styles.footerInner,
                styles.motionCard,
                styles.motionCardFooter
              )}
            >
              <div className={styles.footerCopy}>
                <div className={styles.footerTop}>
                  <span className={styles.footerBadge}>
                    {t("ppt_generator.outline.footer.badge.selected")}
                  </span>
                  <h3 className={styles.footerTitle}>
                    {t("ppt_generator.outline.footer.title")}
                  </h3>
                </div>
                <p className={styles.footerMeta}>
                  {t("ppt_generator.outline.footer.body")}
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
        ) : null}
      </div>
    </div>
  );
};

export default OutlinePage;

