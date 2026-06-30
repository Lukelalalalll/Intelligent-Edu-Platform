'use client'

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Expand,
  Loader2,
  Monitor,
  Sparkles,
} from "lucide-react";

import { useI18n } from "@/shared/i18n";
import { resolveBackendAssetUrl } from "@/utils/api";
import styles from "../customTemplateWorkbench.module.css";
import type { SlidePreviewSectionProps } from "../types";

export const SlidePreviewSection: React.FC<SlidePreviewSectionProps> = ({
  previewData,
  onInitTemplate,
  isLoading,
}) => {
  const { t } = useI18n();
  const previewSlides = React.useMemo(
    () => (previewData.slide_image_urls || []).map((url) => resolveBackendAssetUrl(url)),
    [previewData.slide_image_urls]
  );
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const slideCount = previewSlides.length;
  const fontCount = Object.keys(previewData.fonts || {}).length;
  const isPreviewOpen = activeIndex !== null;
  const currentSlideUrl = activeIndex !== null ? previewSlides[activeIndex] : null;
  const currentSlideNumber = activeIndex !== null ? activeIndex + 1 : 0;
  const canGoPrev = activeIndex !== null && activeIndex > 0;
  const canGoNext = activeIndex !== null && activeIndex < slideCount - 1;
  const renderModeLabel =
    previewData.render_mode === "pptx_to_html"
      ? "PPTX to HTML"
      : previewData.render_mode === "libreoffice_png"
        ? "LibreOffice Raster"
        : "Degraded Fallback";

  const openPreview = React.useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const closePreview = React.useCallback(() => {
    setActiveIndex(null);
  }, []);

  const showPrev = React.useCallback(() => {
    setActiveIndex((current) => (current !== null && current > 0 ? current - 1 : current));
  }, []);

  const showNext = React.useCallback(() => {
    setActiveIndex((current) =>
      current !== null && current < slideCount - 1 ? current + 1 : current
    );
  }, [slideCount]);

  const previewNoticeClass =
    previewData.render_mode === "libreoffice_png" ? styles.infoNote : styles.warningNote;

  return (
    <>
      <div className={styles.grid}>
        <section className={styles.previewCard}>
          <div className={styles.cardHeader}>
            <h2>{t("ppt_generator.customTemplate.preview.title")}</h2>
            <p>{t("ppt_generator.customTemplate.preview.body")}</p>
          </div>

          <div className={styles.previewGrid}>
            {previewSlides.map((url, index) => (
              <div key={url} className={styles.previewTile}>
                <button
                  type="button"
                  className={styles.previewTileButton}
                  onClick={() => openPreview(index)}
                  aria-label={t("ppt_generator.customTemplate.preview.slide", { count: index + 1 })}
                >
                  <div className={styles.previewTileFrame}>
                    <img
                      src={url}
                      alt={t("ppt_generator.customTemplate.preview.slide", { count: index + 1 })}
                      loading="lazy"
                      draggable={false}
                    />
                    <span className={styles.previewTileOverlay}>
                      <Expand className="h-4 w-4" />
                      <span>{t("ppt_generator.customTemplate.preview.ready")}</span>
                    </span>
                  </div>
                  <div className={styles.previewTileMeta}>
                    <strong className={styles.ruleLabel}>
                      {t("ppt_generator.customTemplate.preview.slide", { count: index + 1 })}
                    </strong>
                    <span>
                      {index === 0
                        ? t("ppt_generator.customTemplate.preview.coverCandidate")
                        : t("ppt_generator.customTemplate.preview.ready")}
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <h3>{t("ppt_generator.customTemplate.preview.summary.title")}</h3>
            <p>{t("ppt_generator.customTemplate.preview.summary.body")}</p>
          </div>

          <div className={styles.summaryGrid}>
            <strong>
              {t("ppt_generator.customTemplate.preview.summary.slides")}
              <span>{slideCount}</span>
            </strong>
            <strong>
              {t("ppt_generator.customTemplate.preview.summary.fonts")}
              <span>{fontCount}</span>
            </strong>
            <strong>
              {t("ppt_generator.customTemplate.preview.summary.output")}
              <span>{renderModeLabel}</span>
            </strong>
            <strong>
              {t("ppt_generator.customTemplate.preview.summary.next")}
              <span>{t("ppt_generator.customTemplate.preview.summary.nextValue")}</span>
            </strong>
          </div>

          <div className={styles.statusCard}>
            <div className={styles.statusHeader}>
              <h3>{t("ppt_generator.customTemplate.preview.checklist.title")}</h3>
            </div>
            <ul className={styles.statusList}>
              <li className={styles.statusItem}>
                <span className={styles.statusLabel}>
                  {t("ppt_generator.customTemplate.preview.checklist.fidelity.label")}
                </span>
                <span className={styles.statusValue}>
                  {t("ppt_generator.customTemplate.preview.checklist.fidelity.value")}
                </span>
              </li>
              <li className={styles.statusItem}>
                <span className={styles.statusLabel}>
                  {t("ppt_generator.customTemplate.preview.checklist.typography.label")}
                </span>
                <span className={styles.statusValue}>
                  {t("ppt_generator.customTemplate.preview.checklist.typography.value")}
                </span>
              </li>
              <li className={styles.statusItem}>
                <span className={styles.statusLabel}>
                  {t("ppt_generator.customTemplate.preview.checklist.generation.label")}
                </span>
                <span className={styles.statusValue}>
                  {t("ppt_generator.customTemplate.preview.checklist.generation.value")}
                </span>
              </li>
            </ul>
          </div>

          {previewData.preview_warning ? (
            <div className={previewNoticeClass}>
              <div className="flex items-start gap-2">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{previewData.preview_warning}</span>
              </div>
            </div>
          ) : null}

          <div className={styles.warningNote}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("ppt_generator.customTemplate.preview.warning")}</span>
            </div>
          </div>

          <div className={styles.toolbarActions}>
            <Button
              size="lg"
              onClick={onInitTemplate}
              disabled={isLoading}
              className="h-10 rounded-lg bg-[var(--primary-color,#007B55)] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-dark,#006644)]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("ppt_generator.customTemplate.preview.starting")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t("ppt_generator.customTemplate.preview.generate")}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </aside>
      </div>

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
      >
        <DialogContent className={styles.previewModalContent}>
          <div className={styles.previewModalHeader}>
            <div className={styles.previewModalTitleStack}>
              <DialogTitle className={styles.previewModalTitle}>
                {t("ppt_generator.customTemplate.preview.slide", { count: currentSlideNumber })}
              </DialogTitle>
              <DialogDescription className={styles.previewModalDescription}>
                {renderModeLabel}
              </DialogDescription>
            </div>
            <div className={styles.previewModalCount}>
              {currentSlideNumber} / {slideCount}
            </div>
          </div>

          <div className={styles.previewModalStage}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={styles.previewNavButton}
              onClick={showPrev}
              disabled={!canGoPrev}
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className={styles.previewModalCanvas}>
              {currentSlideUrl ? (
                <img
                  src={currentSlideUrl}
                  alt={t("ppt_generator.customTemplate.preview.slide", { count: currentSlideNumber })}
                  className={styles.previewModalImage}
                  draggable={false}
                />
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className={styles.previewNavButton}
              onClick={showNext}
              disabled={!canGoNext}
              aria-label="Next slide"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {previewData.preview_warning ? (
            <div className={previewNoticeClass}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{previewData.preview_warning}</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
