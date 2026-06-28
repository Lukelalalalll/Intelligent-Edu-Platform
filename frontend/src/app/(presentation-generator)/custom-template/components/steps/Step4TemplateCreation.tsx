

import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Edit3, Save, Sparkles } from "lucide-react";
import { ProcessedSlide } from "../../types";
import { SchemaHighlightProvider } from "../SchemaHighlightContext";
import { SlidesList } from "./SlidesList";
import { SchemaEditorPanel } from "../SchemaEditorPanel";
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
}) => {
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
              <h3>Generation Status</h3>
              <p>
                Track slide reconstruction, open schema editing, and package the
                finished template from one place.
              </p>
            </div>

            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-4 space-y-3">
              <div className={styles.statusRow}>
                <strong>Completed</strong>
                <span>{completedSlides}/{totalSlides || slides.length}</span>
              </div>
              <div className={styles.statusRow}>
                <strong>Active mode</strong>
                <span>{isSchemaEditorOpen ? "Schema editing" : "Slide review"}</span>
              </div>
              <div className={styles.statusRow}>
                <strong>Ready to save</strong>
                <span>{isCompleted ? "Yes" : "Not yet"}</span>
              </div>
            </div>
          </section>

          {isSchemaEditorOpen && schemaEditorSlide ? (
            <section className={styles.editorSidebarPanel}>
              <div className={styles.editorSidebarPanelPad}>
                <div className={styles.panelHeader}>
                  <h3>Schema Editor</h3>
                  <p>
                    Editing slide {schemaEditorSlideIndex + 1}. Update field constraints and
                    content structure without leaving the workspace.
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
                <h3>Schema Editing</h3>
                <p>
                  Open a slide&apos;s schema editor to tune field limits, data shape, and
                  generated content expectations.
                </p>
              </div>
              <div className={styles.infoNote}>
                <div className="flex items-start gap-2">
                  <Edit3 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Select the <strong>Schema</strong> action on any generated slide to open the editor here.</span>
                </div>
              </div>
            </section>
          )}

          <section className={styles.summaryCard}>
            <div className={styles.saveCard}>
              <div className={styles.summaryHeader}>
                <h3>Save Template</h3>
                <p>
                  When all required slides are reconstructed, package the result as a reusable custom PPT Generator template.
                </p>
              </div>

              {isCompleted ? (
                <div className={styles.successNote}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>The generation flow is complete. Review any final schema tweaks, then save the template.</span>
                  </div>
                </div>
              ) : (
                <div className={styles.infoNote}>
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Saving becomes primary once the slide reconstruction run reaches the completed state.</span>
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
                {isSavingLayout ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </SchemaHighlightProvider>
  );
};

