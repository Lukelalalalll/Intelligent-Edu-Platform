import React from "react";

import { useI18n } from "@/shared/i18n";
import {
  IMAGE_PROVIDERS,
  LLM_PROVIDERS,
  WEB_SEARCH_PROVIDERS,
} from "@/utils/providerConstants";
import type { PptGeneratorSelectableProvider } from "@/ppt_generator/providerOverride";
import type { LLMConfig } from "@/types/llm_config";

type ProviderCard = {
  id: PptGeneratorSelectableProvider;
  label: string;
  configured: boolean;
  model: string;
};

type CurrentConfigProps = {
  llmConfig: LLMConfig;
  providerCards: ProviderCard[];
  selectedProvider: PptGeneratorSelectableProvider | null;
  webSearchEnabled: boolean;
  onProviderSelect: (provider: PptGeneratorSelectableProvider) => void;
};

function getSelectedTextModel(
  llmConfig: LLMConfig,
  provider: string
): string {
  switch (provider) {
    case "openai":
      return llmConfig.OPENAI_MODEL || "";
    case "deepseek":
      return llmConfig.DEEPSEEK_MODEL || "";
    case "google":
      return llmConfig.GOOGLE_MODEL || "";
    case "vertex":
      return llmConfig.VERTEX_MODEL || "";
    case "azure":
      return llmConfig.AZURE_OPENAI_MODEL || "";
    case "bedrock":
      return llmConfig.BEDROCK_MODEL || "";
    case "openrouter":
      return llmConfig.OPENROUTER_MODEL || "";
    case "fireworks":
      return llmConfig.FIREWORKS_MODEL || "";
    case "together":
      return llmConfig.TOGETHER_MODEL || "";
    case "cerebras":
      return llmConfig.CEREBRAS_MODEL || "";
    case "litellm":
      return llmConfig.LITELLM_MODEL || "";
    case "lmstudio":
      return llmConfig.LMSTUDIO_MODEL || "";
    case "anthropic":
      return llmConfig.ANTHROPIC_MODEL || "";
    case "ollama":
      return llmConfig.OLLAMA_MODEL || "";
    case "custom":
      return llmConfig.CUSTOM_MODEL || "";
    case "codex":
      return llmConfig.CODEX_MODEL || "";
    default:
      return "";
  }
}

const CurrentConfig = ({
  llmConfig,
  providerCards,
  selectedProvider,
  webSearchEnabled,
  onProviderSelect,
}: CurrentConfigProps) => {
  const { t } = useI18n();
  const textProviderKey = llmConfig.LLM || "openai";
  const textProviderLabel = LLM_PROVIDERS[textProviderKey]?.label || textProviderKey;
  const selectedTextModel = getSelectedTextModel(llmConfig, textProviderKey);
  const textSummary = selectedTextModel
    ? `${textProviderLabel} (${selectedTextModel})`
    : textProviderLabel;

  const imageSummary = llmConfig.DISABLE_IMAGE_GENERATION
    ? t("ppt_generator.upload.currentConfig.imagesDisabled")
    : llmConfig.IMAGE_PROVIDER
      ? IMAGE_PROVIDERS[llmConfig.IMAGE_PROVIDER]?.label || llmConfig.IMAGE_PROVIDER
      : t("ppt_generator.upload.currentConfig.noImageProvider");
  const webSearchProviderKey = (llmConfig.WEB_SEARCH_PROVIDER || "auto").toLowerCase();
  const webSearchProvider =
    WEB_SEARCH_PROVIDERS[webSearchProviderKey]?.label || webSearchProviderKey;
  const webSearchSummary = `${webSearchProvider} (${webSearchEnabled ? t("ppt_generator.upload.currentConfig.webState.on") : t("ppt_generator.upload.currentConfig.webState.off")})`;

  const items = [
    { label: t("ppt_generator.upload.currentConfig.text"), value: textSummary },
    { label: t("ppt_generator.upload.currentConfig.images"), value: imageSummary },
    { label: t("ppt_generator.upload.currentConfig.web"), value: webSearchSummary },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {providerCards.map((provider) => {
          const isSelected = provider.id === selectedProvider;
          const configured = provider.configured;
          const borderClass = configured
            ? isSelected
              ? "border-[#0b6b4b] bg-[rgba(11,107,75,0.12)] shadow-[0_16px_30px_-24px_rgba(11,107,75,0.55)]"
              : "border-[rgba(11,107,75,0.26)] bg-[rgba(11,107,75,0.04)]"
            : "border-[rgba(148,163,184,0.35)] bg-[rgba(148,163,184,0.08)]";
          const statusClass = configured
            ? "bg-[rgba(11,107,75,0.14)] text-[#0b6b4b]"
            : "bg-[rgba(148,163,184,0.18)] text-[#64748b]";

          return (
            <button
              key={provider.id}
              type="button"
              disabled={!configured}
              onClick={() => onProviderSelect(provider.id)}
              className={`flex min-h-[104px] w-full flex-col rounded-[18px] border px-4 py-3 text-left transition ${borderClass} ${
                configured ? "cursor-pointer hover:-translate-y-[1px]" : "cursor-not-allowed opacity-80"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {provider.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#475569]">
                    {provider.model || t("ppt_generator.upload.currentConfig.defaultModel")}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass}`}
                >
                  {configured
                    ? t("ppt_generator.upload.currentConfig.configured")
                    : t("ppt_generator.upload.currentConfig.unconfigured")}
                </span>
              </div>
              {isSelected ? (
                <span className="mt-3 text-xs font-semibold text-[#0b6b4b]">
                  {t("ppt_generator.upload.currentConfig.selected")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {items.map((item) => (
          <div
            key={item.label}
            className="max-w-full rounded-full border border-[rgba(0,123,85,0.12)] bg-white/80 px-3 py-2 shadow-[0_10px_18px_-18px_rgba(15,23,42,0.65)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(0,123,85,0.78)]">
              {item.label}
            </p>
            <p className="mt-1 break-words text-sm font-medium leading-5 text-[#1F2937]">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CurrentConfig;

