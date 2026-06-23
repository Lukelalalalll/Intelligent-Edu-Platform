"use client";

import { ArrowRight, Paperclip, Sparkles } from "lucide-react";

import Button from "@/shared/components/Button/Button";
import Card from "@/shared/components/Card/Card";

import { type PresentationConfig } from "../type";
import { ConfigurationSelects } from "./ConfigurationSelects";
import CurrentConfig from "./CurrentConfig";
import { PromptInput } from "./PromptInput";
import SupportingDoc from "./SupportingDoc";
import {
  type UploadActionItem,
  type UploadStatusItem,
  UPLOAD_FLOW_NOTE,
} from "./uploadPageHelpers";
import styles from "./UploadPage.module.css";

type UploadInputSectionProps = {
  files: File[];
  prompt: string;
  onFilesChange: (files: File[]) => void;
  onPromptChange: (value: string) => void;
};

type UploadSetupSectionProps = {
  actionSummary: UploadActionItem[];
  config: PresentationConfig;
  isLoading: boolean;
  primaryActionLabel: string;
  statusCards: UploadStatusItem[];
  onConfigChange: (key: keyof PresentationConfig, value: unknown) => void;
  onGeneratePresentation: () => void;
};

export function UploadInputSection({
  files,
  prompt,
  onFilesChange,
  onPromptChange,
}: UploadInputSectionProps) {
  return (
    <Card glass className={`${styles.sectionCard} ${styles.promptCard}`}>
      <div className={styles.promptBody}>
        <PromptInput value={prompt} onChange={onPromptChange} />

        <div className={styles.promptAttachments}>
          <div className={styles.subsectionHeader}>
            <div className={styles.subsectionIcon}>
              <Paperclip className="h-4 w-4" />
            </div>
            <div>
              <h3 className={styles.subsectionTitle}>Attach source material</h3>
            </div>
          </div>

          <SupportingDoc files={[...files]} onFilesChange={onFilesChange} />
        </div>
      </div>
    </Card>
  );
}

export function UploadSetupSection({
  actionSummary,
  config,
  isLoading,
  primaryActionLabel,
  statusCards,
  onConfigChange,
  onGeneratePresentation,
}: UploadSetupSectionProps) {
  return (
    <Card glass className={`${styles.sectionCard} ${styles.setupCard}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}>
          <Sparkles />
        </div>
        <div>
          <p className={styles.sectionEyebrow}>Workspace</p>
          <h2 className={styles.sectionTitle}>Current AI setup</h2>
          <p className={styles.sectionDescription}>
            This page now uses your saved project providers and model settings
            directly, so Presenton feels like part of the same workflow.
          </p>
        </div>
      </div>

      <div className={styles.setupBody}>
        <CurrentConfig webSearchEnabled={config.webSearch} />

        <div className={styles.promptFooter}>
          <div className={styles.actionSummary}>
            {actionSummary.map((item) => (
              <div key={item.label} className={styles.actionItem}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <Button
            onClick={onGeneratePresentation}
            disabled={isLoading}
            className={styles.primaryAction}
          >
            <span>{primaryActionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className={styles.statusGrid}>
          {statusCards.map((card) => (
            <div key={card.label} className={styles.statusCard}>
              <span className={styles.statusLabel}>{card.label}</span>
              <div className={styles.statusValue}>{card.value}</div>
            </div>
          ))}
        </div>

        <div className={styles.controlsBody}>
          <ConfigurationSelects config={config} onConfigChange={onConfigChange} />
          <p className={styles.controlsNote}>{UPLOAD_FLOW_NOTE}</p>
        </div>
      </div>
    </Card>
  );
}
