"use client";

import { ArrowRight, Paperclip, Sparkles } from "lucide-react";
import type { LLMConfig } from "@/types/llm_config";
import type { PresentonSelectableProvider } from "@/presenton/providerOverride";

import Button from "@/shared/components/Button/Button";
import Card from "@/shared/components/Card/Card";
import { useI18n } from "@/shared/i18n";

import { type PresentationConfig } from "../type";
import { ConfigurationSelects } from "./ConfigurationSelects";
import CurrentConfig from "./CurrentConfig";
import { PromptInput } from "./PromptInput";
import SupportingDoc from "./SupportingDoc";
import {
  type UploadActionItem,
  type UploadStatusItem,
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
  generationDisabledReason: string | null;
  isLoading: boolean;
  llmConfig: LLMConfig;
  providerCards: Array<{
    id: PresentonSelectableProvider;
    label: string;
    configured: boolean;
    model: string;
  }>;
  primaryActionLabel: string;
  selectedProvider: PresentonSelectableProvider | null;
  statusCards: UploadStatusItem[];
  onConfigChange: (key: keyof PresentationConfig, value: unknown) => void;
  onGeneratePresentation: () => void;
  onProviderSelect: (provider: PresentonSelectableProvider) => void;
};

export function UploadInputSection({
  files,
  prompt,
  onFilesChange,
  onPromptChange,
}: UploadInputSectionProps) {
  const { t } = useI18n();

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
              <h3 className={styles.subsectionTitle}>{t("presenton.upload.attach.title")}</h3>
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
  generationDisabledReason,
  isLoading,
  llmConfig,
  providerCards,
  primaryActionLabel,
  selectedProvider,
  statusCards,
  onConfigChange,
  onGeneratePresentation,
  onProviderSelect,
}: UploadSetupSectionProps) {
  const { t } = useI18n();

  return (
    <Card glass className={`${styles.sectionCard} ${styles.setupCard}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}>
          <Sparkles />
        </div>
        <div>
          <p className={styles.sectionEyebrow}>{t("presenton.upload.setup.eyebrow")}</p>
          <h2 className={styles.sectionTitle}>{t("presenton.upload.setup.title")}</h2>
          <p className={styles.sectionDescription}>
            {t("presenton.upload.setup.description")}
          </p>
        </div>
      </div>

      <div className={styles.setupBody}>
        <CurrentConfig
          llmConfig={llmConfig}
          providerCards={providerCards}
          selectedProvider={selectedProvider}
          webSearchEnabled={config.webSearch}
          onProviderSelect={onProviderSelect}
        />

        <div className={styles.promptFooter}>
          <div className={styles.actionSummary}>
            {actionSummary.map((item) => (
              <div key={item.label} className={styles.actionItem}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
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
          <p className={styles.controlsNote}>{t("presenton.upload.flowNote")}</p>
        </div>

        <div className={styles.setupActionBar}>
          <Button
            onClick={onGeneratePresentation}
            disabled={isLoading || !!generationDisabledReason}
            className={styles.primaryAction}
          >
            <span>{primaryActionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          {generationDisabledReason ? (
            <p className={styles.controlsNote}>{generationDisabledReason}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
