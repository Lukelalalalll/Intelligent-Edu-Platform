import Link from "@/presenton/shims/next-link";
import { Button } from "@/components/ui/button";
import WorkspaceCard from "@/shared/components/Card/Card";
import { cn } from "@/lib/utils";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";

import type { PreviewStat } from "./templatePreviewData";
import styles from "./TemplatePreviewClient.module.css";

type TemplatePreviewControlsProps = {
  isCustom: boolean;
  isMissingTemplate: boolean;
  previewStats: PreviewStat[];
  shouldShowDeleteAction: boolean;
  showStats: boolean;
  summaryDescription: string;
  summaryTitle: string;
  onDeleteCustomTemplate: () => void;
};

export function TemplatePreviewControls({
  isCustom,
  isMissingTemplate,
  previewStats,
  shouldShowDeleteAction,
  showStats,
  summaryDescription,
  summaryTitle,
  onDeleteCustomTemplate,
}: TemplatePreviewControlsProps) {
  return (
    <WorkspaceCard
      glass
      className={cn(styles.surfaceCard, styles.motionCard, styles.motionPrimary)}
    >
      <div className={styles.controlSection}>
        <div className={styles.controlTop}>
          <div className={styles.controlCopy}>
            <Link href="/templates" className={styles.secondaryAction}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Templates</span>
            </Link>
            <div className={styles.badge}>
              <Sparkles className="h-3.5 w-3.5" />
              {isCustom ? "Custom template" : "Built-in family"}
            </div>
            <div className={styles.controlHeadingRow}>
              <h2 className={styles.controlTitle}>{summaryTitle}</h2>
              {isCustom && !isMissingTemplate ? (
                <span className={styles.inlinePill}>Custom</span>
              ) : null}
            </div>
            <p className={styles.controlDescription}>{summaryDescription}</p>
          </div>

          <div className={styles.controlActions}>
            {shouldShowDeleteAction ? (
              <Button
                type="button"
                variant="outline"
                onClick={onDeleteCustomTemplate}
                className={styles.dangerAction}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Delete Template</span>
              </Button>
            ) : null}
            <p className={styles.controlHelper}>
              Preview stays read-only here, so you can compare structure, pacing,
              and deck coverage without switching into editing tools.
            </p>
          </div>
        </div>

        {showStats ? (
          <div className={styles.statsGrid}>
            {previewStats.map((stat) => (
              <div key={stat.label} className={styles.statCard}>
                <span className={styles.statLabel}>{stat.label}</span>
                <div className={styles.statValue}>{stat.value}</div>
                <p className={styles.statMeta}>{stat.meta}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </WorkspaceCard>
  );
}
