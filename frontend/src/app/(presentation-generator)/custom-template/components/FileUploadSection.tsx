import React from "react";
import {
  ChevronRight,
  FileText,
  Info,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { useI18n } from "@/shared/i18n";

import styles from "../customTemplateWorkbench.module.css";
import type { ProcessedSlide } from "../types";

interface FileUploadSectionProps {
  selectedFile: File | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeFile: () => void;
  CheckFonts: () => void;
  isProcessingPptx: boolean;
  slides: ProcessedSlide[];
  completedSlides: number;
  isDragging: boolean;
  handleDragOver: (event: React.DragEvent<HTMLElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  handleDrop: (event: React.DragEvent<HTMLElement>) => void;
  multimodalConfigured: boolean;
  multimodalModel: string;
  multimodalProviderLabel: string;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  selectedFile,
  handleFileSelect,
  removeFile,
  CheckFonts,
  isProcessingPptx,
  slides,
  completedSlides,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  multimodalConfigured,
  multimodalModel,
  multimodalProviderLabel,
}) => {
  const { t } = useI18n();
  const isProcessing = isProcessingPptx || slides.some((slide) => slide.processing);
  const selectedFileSize = selectedFile
    ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
    : t("ppt_generator.customTemplate.fileUpload.noFile");

  return (
    <div className={styles.grid}>
      <div className={styles.stack}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>{t("ppt_generator.customTemplate.fileUpload.title")}</h2>
            <p>{t("ppt_generator.customTemplate.fileUpload.body")}</p>
          </div>

          <label
            className={`${styles.uploadDrop} ${isDragging ? styles.uploadDropActive : ""}`.trim()}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".pptx"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!selectedFile ? (
              <>
                <div className={styles.uploadIconWrap}>
                  <Upload className="h-6 w-6" />
                </div>
                <div className={styles.uploadHeadline}>
                  {t("ppt_generator.customTemplate.fileUpload.prompt")}
                </div>
                <p className={styles.supportText}>
                  {t("ppt_generator.customTemplate.fileUpload.support")}
                </p>
              </>
            ) : (
              <>
                <div className={styles.uploadIconWrap}>
                  <FileText className="h-6 w-6" />
                </div>
                <div className={styles.uploadHeadline}>{selectedFile.name}</div>
                <p className={styles.supportText}>
                  {t("ppt_generator.customTemplate.fileUpload.ready")}
                </p>
              </>
            )}
          </label>

          {selectedFile ? (
            <div className={styles.uploadMeta}>
              <div className={styles.stack} style={{ gap: 10 }}>
                <span className={styles.fileBadge}>
                  <FileText className="h-4 w-4" />
                  {selectedFile.name}
                </span>
                <p className={styles.metaText}>
                  {t("ppt_generator.customTemplate.fileUpload.deckSize", {
                    size: selectedFileSize,
                  })}
                </p>
              </div>
              <div className={styles.toolbarActions}>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={removeFile}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                  {t("ppt_generator.customTemplate.fileUpload.remove")}
                </button>
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  onClick={CheckFonts}
                  disabled={isProcessing}
                >
                  {isProcessingPptx ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {isProcessingPptx
                    ? t("ppt_generator.customTemplate.fileUpload.checking")
                    : t("ppt_generator.customTemplate.fileUpload.check")}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>{t("ppt_generator.customTemplate.fileUpload.rules.title")}</h3>
            <p>{t("ppt_generator.customTemplate.fileUpload.rules.body")}</p>
          </div>

          <ul className={styles.ruleList}>
            <li className={styles.ruleItem}>
              <span className={styles.ruleLabel}>
                {t("ppt_generator.customTemplate.fileUpload.rules.accepted")}
              </span>
              <span className={styles.metaValue}>
                {t("ppt_generator.customTemplate.fileUpload.rules.acceptedValue")}
              </span>
            </li>
            <li className={styles.ruleItem}>
              <span className={styles.ruleLabel}>
                {t("ppt_generator.customTemplate.fileUpload.rules.maxSize")}
              </span>
              <span className={styles.metaValue}>
                {t("ppt_generator.customTemplate.fileUpload.rules.maxSizeValue")}
              </span>
            </li>
            <li className={styles.ruleItem}>
              <span className={styles.ruleLabel}>
                {t("ppt_generator.customTemplate.fileUpload.rules.time")}
              </span>
              <span className={styles.metaValue}>
                {t("ppt_generator.customTemplate.fileUpload.rules.timeValue")}
              </span>
            </li>
          </ul>

          <div className={styles.infoNote}>
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {multimodalConfigured
                  ? `${multimodalProviderLabel || "OpenAI"} (${multimodalModel || "model unset"}) | ${t("ppt_generator.customTemplate.fileUpload.info")}`
                  : t("ppt_generator.customTemplate.fileUpload.info")}
              </span>
            </div>
          </div>
        </section>
      </div>

      <aside className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <h3>{t("ppt_generator.customTemplate.fileUpload.summary.title")}</h3>
          <p>{t("ppt_generator.customTemplate.fileUpload.summary.body")}</p>
        </div>

        <div className={styles.summaryGrid}>
          <strong>
            {t("ppt_generator.customTemplate.fileUpload.summary.currentFile")}
            <span>
              {selectedFile?.name || t("ppt_generator.customTemplate.fileUpload.summary.waiting")}
            </span>
          </strong>
          <strong>
            {t("ppt_generator.customTemplate.fileUpload.summary.deckSize")}
            <span>{selectedFileSize}</span>
          </strong>
          <strong>
            {t("ppt_generator.customTemplate.fileUpload.summary.progress")}
            <span>
              {slides.length > 0
                ? `${completedSlides}/${slides.length}`
                : t("ppt_generator.customTemplate.fileUpload.summary.notStarted")}
            </span>
          </strong>
          <strong>
            {t("ppt_generator.customTemplate.fileUpload.summary.next")}
            <span>
              {selectedFile
                ? t("ppt_generator.customTemplate.fileUpload.summary.nextCheck")
                : t("ppt_generator.customTemplate.fileUpload.summary.nextUpload")}
            </span>
          </strong>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <h3>{t("ppt_generator.customTemplate.fileUpload.next.title")}</h3>
          </div>
          <ul className={styles.statusList}>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t("ppt_generator.customTemplate.fileUpload.next.step1.label")}
              </span>
              <span className={styles.statusValue}>
                {t("ppt_generator.customTemplate.fileUpload.next.step1.value")}
              </span>
            </li>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t("ppt_generator.customTemplate.fileUpload.next.step2.label")}
              </span>
              <span className={styles.statusValue}>
                {t("ppt_generator.customTemplate.fileUpload.next.step2.value")}
              </span>
            </li>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>
                {t("ppt_generator.customTemplate.fileUpload.next.step3.label")}
              </span>
              <span className={styles.statusValue}>
                {t("ppt_generator.customTemplate.fileUpload.next.step3.value")}
              </span>
            </li>
          </ul>
        </div>

        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.summaryAction}
            onClick={CheckFonts}
            disabled={!selectedFile || isProcessing}
          >
            {isProcessingPptx ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isProcessingPptx
              ? t("ppt_generator.customTemplate.fileUpload.checking")
              : t("ppt_generator.customTemplate.fileUpload.check")}
          </button>
        </div>
      </aside>
    </div>
  );
};
