import React from "react";
import {
  ChevronRight,
  FileText,
  Info,
  Loader2,
  Upload,
  X,
} from "lucide-react";

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
}) => {
  const isProcessing = isProcessingPptx || slides.some((slide) => slide.processing);
  const selectedFileSize = selectedFile
    ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
    : "No file selected";

  return (
    <div className={styles.grid}>
      <div className={styles.stack}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Upload Source Deck</h2>
            <p>
              Drop a `.pptx` file to extract slides, audit font availability, and
              move into PPT Generator&apos;s template reconstruction workflow.
            </p>
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
                <div className={styles.uploadHeadline}>Click to upload or drag and drop</div>
                <p className={styles.supportText}>
                  Import the original presentation file so PPT Generator can map slide
                  images, font dependencies, and reusable layout code.
                </p>
              </>
            ) : (
              <>
                <div className={styles.uploadIconWrap}>
                  <FileText className="h-6 w-6" />
                </div>
                <div className={styles.uploadHeadline}>{selectedFile.name}</div>
                <p className={styles.supportText}>
                  Presentation deck ready for font validation.
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
                <p className={styles.metaText}>Deck size: {selectedFileSize}</p>
              </div>
              <div className={styles.toolbarActions}>
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={removeFile}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                  Remove file
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
                  {isProcessingPptx ? "Checking Fonts..." : "Check Fonts"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>File Rules & Model Guidance</h3>
            <p>
              Keep the upload predictable before extraction begins.
            </p>
          </div>

          <ul className={styles.ruleList}>
            <li className={styles.ruleItem}>
              <span className={styles.ruleLabel}>Accepted input</span>
              <span className={styles.metaValue}>PPTX only</span>
            </li>
            <li className={styles.ruleItem}>
              <span className={styles.ruleLabel}>Max file size</span>
              <span className={styles.metaValue}>100 MB</span>
            </li>
            <li className={styles.ruleItem}>
              <span className={styles.ruleLabel}>Typical processing time</span>
              <span className={styles.metaValue}>About 5 minutes</span>
            </li>
          </ul>

          <div className={styles.infoNote}>
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Each slide is analyzed as a screenshot plus HTML reference. Use a
                vision-capable text model in Settings for faithful layout recovery.
              </span>
            </div>
          </div>
        </section>
      </div>

      <aside className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <h3>Processing Summary</h3>
          <p>
            The right rail stays focused on readiness, effort, and the next action.
          </p>
        </div>

        <div className={styles.summaryGrid}>
          <strong>
            Current file
            <span>{selectedFile?.name || "Waiting for upload"}</span>
          </strong>
          <strong>
            Deck size
            <span>{selectedFileSize}</span>
          </strong>
          <strong>
            Stage progress
            <span>
              {slides.length > 0 ? `${completedSlides}/${slides.length} slides` : "Not started"}
            </span>
          </strong>
          <strong>
            Next step
            <span>{selectedFile ? "Check fonts" : "Upload a PPTX"}</span>
          </strong>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <h3>What happens next</h3>
          </div>
          <ul className={styles.statusList}>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>1. Font scan</span>
              <span className={styles.statusValue}>Audit missing typefaces</span>
            </li>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>2. Slide preview</span>
              <span className={styles.statusValue}>Verify extracted images</span>
            </li>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>3. Template generation</span>
              <span className={styles.statusValue}>Convert slides to editable layouts</span>
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
            {isProcessingPptx ? "Checking Fonts..." : "Check Fonts"}
          </button>
        </div>
      </aside>
    </div>
  );
};

