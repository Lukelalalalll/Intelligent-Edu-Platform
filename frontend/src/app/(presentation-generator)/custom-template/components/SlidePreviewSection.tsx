'use client'

import React from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronRight,
  Images,
  Loader2,
  Sparkles,
  Type,
} from "lucide-react";

import { resolveBackendAssetUrl } from "@/utils/api";
import styles from "../customTemplateWorkbench.module.css";
import type { SlidePreviewSectionProps } from "../types";

export const SlidePreviewSection: React.FC<SlidePreviewSectionProps> = ({
  previewData,
  onInitTemplate,
  isLoading,
}) => {
  const slideCount = previewData.slide_image_urls?.length || 0;
  const fontCount = Object.keys(previewData.fonts || {}).length;

  return (
    <div className={styles.grid}>
      <section className={styles.previewCard}>
        <div className={styles.cardHeader}>
          <h2>Slide Preview</h2>
          <p>
            Review the extracted slide imagery before PPT Generator converts each one into
            a reusable React template layout.
          </p>
        </div>

        <div className={styles.previewGrid}>
          {previewData.slide_image_urls?.map((url, index) => (
            <div key={index} className={styles.previewTile}>
              <img
                src={resolveBackendAssetUrl(url)}
                alt={`Slide ${index + 1}`}
                loading="lazy"
                draggable={false}
              />
              <div className={styles.previewTileMeta}>
                <strong className={styles.ruleLabel}>Slide {index + 1}</strong>
                <span>{index === 0 ? "Cover candidate" : "Preview ready"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <h3>Preview Summary</h3>
          <p>
            Use this checkpoint to verify extraction fidelity before generation starts.
          </p>
        </div>

        <div className={styles.summaryGrid}>
          <strong>
            Preview slides
            <span>{slideCount}</span>
          </strong>
          <strong>
            Loaded fonts
            <span>{fontCount}</span>
          </strong>
          <strong>
            Output type
            <span>React layouts</span>
          </strong>
          <strong>
            Next step
            <span>Generate template</span>
          </strong>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <h3>Before you continue</h3>
          </div>
          <ul className={styles.statusList}>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>Visual fidelity</span>
              <span className={styles.statusValue}>Check legibility and crop quality</span>
            </li>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>Typography</span>
              <span className={styles.statusValue}>Confirm fonts rendered as expected</span>
            </li>
            <li className={styles.statusItem}>
              <span className={styles.statusLabel}>Generation</span>
              <span className={styles.statusValue}>Layouts will start slide-by-slide</span>
            </li>
          </ul>
        </div>

        <div className={styles.warningNote}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              If a slide preview already looks wrong here, generation will likely carry
              that issue forward into the reconstructed layout.
            </span>
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
                Starting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Template
                <ChevronRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
};

