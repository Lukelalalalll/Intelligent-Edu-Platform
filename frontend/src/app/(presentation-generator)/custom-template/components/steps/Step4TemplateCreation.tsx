import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Edit3, Images, Save, Settings2, Sparkles } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ProcessedSlide } from "../../types";
import { SchemaHighlightProvider } from "../SchemaHighlightContext";
import { SlidesList } from "./SlidesList";
import { SchemaEditorPanel } from "../SchemaEditorPanel";
import type { PptGeneratorSelectableMultimodalProvider } from "@/ppt_generator/providerOverride";
import styles from "../../customTemplateWorkbench.module.css";

interface Step4TemplateCreationProps {
  slides: ProcessedSlide[];
  setSlides: React.Dispatch<React.SetStateAction<ProcessedSlide[]>>;
  retrySlide: (index: number) => void;
  isCompleted: boolean;
  isSavingLayout: boolean;
  isProcessingSlides: boolean;
  completedSlides: number;
  totalSlides: number;
  onOpenSaveModal: () => void;
  multimodalProvider: PptGeneratorSelectableMultimodalProvider;
  multimodalConfigured: boolean;
  multimodalModel: string;
  multimodalUpdatedAt?: string | null;
  onSelectMultimodalProvider: (provider: PptGeneratorSelectableMultimodalProvider) => void;
  onOpenAIConfig: () => void;
}

export const Step4TemplateCreation: React.FC<Step4TemplateCreationProps> = ({
  slides,
  setSlides,
  retrySlide,
  isCompleted,
  isSavingLayout,
  isProcessingSlides,
  completedSlides,
  totalSlides,
  onOpenSaveModal,
  multimodalProvider,
  multimodalConfigured,
  multimodalModel,
  multimodalUpdatedAt,
  onSelectMultimodalProvider,
  onOpenAIConfig,
}) => {
  const { locale, t } = useI18n();
  const [schemaEditorSlideIndex, setSchemaEditorSlideIndex] = useState<number | null>(null);
  const [schemaPreviewData, setSchemaPreviewData] = useState<Record<number, Record<string, any>>>({});

  const handleSlideUpdate = useCallback(
    (index: number, updatedSlideData: Partial<ProcessedSlide>) => {
      setSlides((prevSlides) =>
        prevSlides.map((slide, slideIndex) =>
          slideIndex === index
            ? { ...slide, ...updatedSlideData, modified: true }
            : slide
        )
      );
    },
    [setSlides]
  );

  const handleOpenSchemaEditor = useCallback((index: number | null) => {
    setSchemaEditorSlideIndex(index);
  }, []);

  const handleCloseSchemaEditor = useCallback(() => {
    setSchemaEditorSlideIndex(null);
  }, []);

  const handleSchemaEditorSave = useCallback(
    (updatedReact: string) => {
      if (schemaEditorSlideIndex !== null) {
        setSlides((prev) =>
          prev.map((slide, index) =>
            index === schemaEditorSlideIndex ? { ...slide, react: updatedReact } : slide
          )
        );
      }
      setSchemaEditorSlideIndex(null);
    },
    [schemaEditorSlideIndex, setSlides]
  );

  const handleSchemaPreviewContent = useCallback(
    (content: Record<string, any>) => {
      if (schemaEditorSlideIndex !== null) {
        setSchemaPreviewData((prev) => ({
          ...prev,
          [schemaEditorSlideIndex]: content,
        }));
      }
    },
    [schemaEditorSlideIndex]
  );

  const handleClearSchemaPreview = useCallback((slideIndex: number) => {
    setSchemaPreviewData((prev) => {
      const next = { ...prev };
      delete next[slideIndex];
      return next;
    });
  }, []);

  const schemaEditorSlide = schemaEditorSlideIndex !== null ? slides[schemaEditorSlideIndex] : null;
  const isSchemaEditorOpen = schemaEditorSlideIndex !== null;
  const progress = totalSlides > 0 ? Math.round((completedSlides / totalSlides) * 100) : 0;
  const updatedAtLabel = useMemo(() => {
    if (!multimodalUpdatedAt) {
      return t("ppt_generator.customTemplate.generation.status.no");
    }
    return new Date(multimodalUpdatedAt).toLocaleString(locale);
  }, [locale, multimodalUpdatedAt, t]);

  return (
    <SchemaHighlightProvider>
      <div className={`${styles.editorGrid} ${isSchemaEditorOpen ? styles.editorLayoutActive : ""}`.trim()}>
        <div className={styles.slidesWrap}>
          <SlidesList
            slides={slides}
            setSlides={setSlides}
            retrySlide={retrySlide}
            onSlideUpdate={handleSlideUpdate}
            onOpenSchemaEditor={handleOpenSchemaEditor}
            schemaEditorSlideIndex={schemaEditorSlideIndex}
            schemaPreviewData={schemaPreviewData}
            onClearSchemaPreview={handleClearSchemaPreview}
            isSchemaEditorOpen={isSchemaEditorOpen}
          />
        </div>

        <aside
          className={`${styles.editorSidebar} ${isSchemaEditorOpen ? styles.editorSidebarActive : ""}`.trim()}
        >
          <section className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <h3>Multimodal Model</h3>
              <p>{t("ppt_generator.customTemplate.toolbar.generation.body")}</p>
            </div>

            <div className="mt-4 space-y-3">
              <div className={styles.statusRow}>
                <strong>Provider</strong>
                <span>{multimodalProvider === "openai" ? "OpenAI" : multimodalProvider}</span>
              </div>
              <div className={styles.statusRow}>
                <strong>Status</strong>
                <span>
                  {multimodalConfigured
                    ? t("ppt_generator.customTemplate.generation.status.yes")
                    : t("ppt_generator.customTemplate.generation.status.no")}
                </span>
              </div>
              <div className={styles.statusRow}>
                <strong>Model</strong>
                <span>{multimodalModel || "Model unset"}</span>
              </div>
              <div className={styles.statusRow}>
                <strong>Updated</strong>
                <span>{updatedAtLabel}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className={styles.infoNote}>
                <div className="flex items-start gap-2">
                  <Images className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {multimodalConfigured
                      ? t("ppt_generator.customTemplate.fileUpload.info")
                      : t("ppt_generator.customTemplate.font.warning")}
                  </span>
                </div>
              </div>

              <div className={styles.toolbarActions}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => onSelectMultimodalProvider("openai")}
                  disabled={isProcessingSlides}
                >
                  <Images className="h-4 w-4" />
                  OpenAI
                </button>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={onOpenAIConfig}
                >
                  <Settings2 className="h-4 w-4" />
                  Open AI Config
                </button>
              </div>
            </div>
          </section>

          <section className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <h3>{t("ppt_generator.customTemplate.generation.status.title")}</h3>
              <p>{t("ppt_generator.customTemplate.generation.status.body")}</p>
            </div>

            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-4 space-y-3">
              <div className={styles.statusRow}>
                <strong>{t("ppt_generator.customTemplate.generation.status.completed")}</strong>
                <span>{completedSlides}/{totalSlides || slides.length}</span>
              </div>
              <div className={styles.statusRow}>
                <strong>{t("ppt_generator.customTemplate.generation.status.mode")}</strong>
                <span>
                  {isSchemaEditorOpen
                    ? t("ppt_generator.customTemplate.generation.status.modeSchema")
                    : t("ppt_generator.customTemplate.generation.status.modeReview")}
                </span>
              </div>
              <div className={styles.statusRow}>
                <strong>{t("ppt_generator.customTemplate.generation.status.ready")}</strong>
                <span>
                  {isCompleted
                    ? t("ppt_generator.customTemplate.generation.status.yes")
                    : t("ppt_generator.customTemplate.generation.status.no")}
                </span>
              </div>
            </div>
          </section>

          {isSchemaEditorOpen && schemaEditorSlide ? (
            <section className={styles.editorSidebarPanel}>
              <div className={styles.editorSidebarPanelPad}>
                <div className={styles.panelHeader}>
                  <h3>{t("ppt_generator.customTemplate.generation.schema.title")}</h3>
                  <p>
                    {t("ppt_generator.customTemplate.generation.schema.body", {
                      count: schemaEditorSlideIndex + 1,
                    })}
                  </p>
                </div>
              </div>
              <div className={styles.editorSidebarPanelBody}>
                <SchemaEditorPanel
                  slide={schemaEditorSlide}
                  slideIndex={schemaEditorSlideIndex}
                  onSave={handleSchemaEditorSave}
                  onCancel={handleCloseSchemaEditor}
                  onFillContent={handleSchemaPreviewContent}
                />
              </div>
            </section>
          ) : (
            <section className={styles.summaryCard}>
              <div className={styles.summaryHeader}>
                <h3>{t("ppt_generator.customTemplate.generation.schema.emptyTitle")}</h3>
                <p>{t("ppt_generator.customTemplate.generation.schema.emptyBody")}</p>
              </div>
              <div className={styles.infoNote}>
                <div className="flex items-start gap-2">
                  <Edit3 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t("ppt_generator.customTemplate.generation.schema.emptyHint")}</span>
                </div>
              </div>
            </section>
          )}

          <section className={styles.summaryCard}>
            <div className={styles.saveCard}>
              <div className={styles.summaryHeader}>
                <h3>{t("ppt_generator.customTemplate.generation.save.title")}</h3>
                <p>{t("ppt_generator.customTemplate.generation.save.body")}</p>
              </div>

              {isCompleted ? (
                <div className={styles.successNote}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{t("ppt_generator.customTemplate.generation.save.success")}</span>
                  </div>
                </div>
              ) : (
                <div className={styles.infoNote}>
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{t("ppt_generator.customTemplate.generation.save.waiting")}</span>
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={onOpenSaveModal}
                disabled={!isCompleted || isSavingLayout || isProcessingSlides}
                className="h-10 rounded-lg bg-[var(--primary-color,#007B55)] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-dark,#006644)]"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSavingLayout
                  ? t("ppt_generator.customTemplate.generation.save.saving")
                  : t("ppt_generator.customTemplate.generation.save.button")}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </SchemaHighlightProvider>
  );
};
