import React from "react";
import BedrockManualFields from "@/components/BedrockManualFields";
import OllamaConfig from "@/components/OllamaConfig";
import VertexAzureManualFields from "@/components/VertexAzureManualFields";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { LLMConfig } from "@/types/llm_config";
import { ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import CodexConfig from "../SettingCodex";
import { TextProviderInputChange } from "./types";
import {
  applyConfigPatch,
  getProviderApiKeyField,
  getProviderApiKeyLabel,
} from "./utils";

const inputClassName =
  "w-full rounded-lg border border-gray-300 px-2 py-3 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

interface TextProviderFieldsProps {
  llmConfig: LLMConfig;
  selectedProvider: string;
  currentApiKey: string;
  currentCustomUrl: string;
  currentBigModelBaseUrl: string;
  currentMiniMaxBaseUrl: string;
  currentOllamaUrl: string;
  onInputChange: TextProviderInputChange;
  showApiKey: boolean;
  onToggleShowApiKey: () => void;
  deepseekAdvancedOpen: boolean;
  onDeepseekAdvancedOpenChange: (open: boolean) => void;
  shouldUseModelLookup: boolean;
  canFetchModels: boolean;
  modelsLoading: boolean;
  modelsChecked: boolean;
  availableModelsCount: number;
  onFetchModels: () => void;
}

interface LabeledTextFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  helperText?: string;
}

const LabeledTextField = ({
  label,
  value,
  placeholder,
  onChange,
  helperText,
}: LabeledTextFieldProps) => {
  return (
    <>
      <label className="mt-3 mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
        placeholder={placeholder}
      />
      {helperText ? (
        <p className="mt-1.5 text-xs text-gray-500">{helperText}</p>
      ) : null}
    </>
  );
};

const TextProviderFields = ({
  llmConfig,
  selectedProvider,
  currentApiKey,
  currentCustomUrl,
  currentBigModelBaseUrl,
  currentMiniMaxBaseUrl,
  currentOllamaUrl,
  onInputChange,
  showApiKey,
  onToggleShowApiKey,
  deepseekAdvancedOpen,
  onDeepseekAdvancedOpenChange,
  shouldUseModelLookup,
  canFetchModels,
  modelsLoading,
  modelsChecked,
  availableModelsCount,
  onFetchModels,
}: TextProviderFieldsProps) => {
  const providerApiKeyLabel = getProviderApiKeyLabel(selectedProvider);
  const showModelCheckButton =
    shouldUseModelLookup && (!modelsChecked || availableModelsCount === 0);

  const handleApiKeyChange = (value: string) => {
    const keyField = getProviderApiKeyField(selectedProvider);
    if (keyField) {
      onInputChange(value, keyField);
    }
  };

  return (
    <>
      <div className="flex w-full flex-col justify-start">
        {selectedProvider === "ollama" ? (
          <div className="w-full">
            <OllamaConfig
              ollamaModel={llmConfig.OLLAMA_MODEL || ""}
              ollamaUrl={currentOllamaUrl}
              onInputChange={(value, field) => {
                if (typeof value !== "string") {
                  return;
                }

                const normalizedField =
                  field === "ollama_url"
                    ? "OLLAMA_URL"
                    : field === "ollama_model"
                    ? "OLLAMA_MODEL"
                    : field;
                onInputChange(value, normalizedField);
              }}
            />
          </div>
        ) : selectedProvider === "codex" ? (
          <div className="mt-0 w-full rounded-[12px]">
            <CodexConfig
              codexModel={llmConfig.CODEX_MODEL || ""}
              onInputChange={(value, field) => {
                const normalizedField =
                  field === "codex_model" ? "CODEX_MODEL" : field;
                onInputChange(value, normalizedField);
              }}
            />
          </div>
        ) : selectedProvider === "bedrock" ? (
          <BedrockManualFields
            llmConfig={llmConfig}
            onPatch={(patch) => applyConfigPatch(onInputChange, patch)}
          />
        ) : (
          <>
            <label className="mb-2 block text-sm font-medium capitalize text-gray-700">
              {providerApiKeyLabel}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={currentApiKey}
                onChange={(event) => handleApiKeyChange(event.target.value)}
                className={inputClassName}
                placeholder={
                  selectedProvider === "litellm"
                    ? "Optional if your proxy does not require auth"
                    : `Enter your ${providerApiKeyLabel}`
                }
              />
              <button
                type="button"
                onClick={onToggleShowApiKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer bg-white px-2 py-1"
              >
                {showApiKey ? (
                  <Eye className="h-4 w-4 text-gray-500" />
                ) : (
                  <EyeOff className="h-4 w-4 text-gray-500" />
                )}
              </button>
            </div>
          </>
        )}

        {selectedProvider === "custom" ? (
          <input
            type="text"
            value={currentCustomUrl}
            onChange={(event) =>
              onInputChange(event.target.value, "CUSTOM_LLM_URL")
            }
            className={`${inputClassName} mt-2`}
            placeholder="OpenAI-compatible URL"
          />
        ) : null}

        {selectedProvider === "bigmodel" ? (
          <LabeledTextField
            label="BigModel base URL"
            value={currentBigModelBaseUrl}
            onChange={(value) => onInputChange(value, "BIGMODEL_BASE_URL")}
            placeholder="https://open.bigmodel.cn/api/paas/v4"
            helperText="OpenAI-compatible endpoint used for GLM text model lookup and generation."
          />
        ) : null}

        {selectedProvider === "minimax" ? (
          <LabeledTextField
            label="MiniMax base URL"
            value={currentMiniMaxBaseUrl}
            onChange={(value) => onInputChange(value, "MINIMAX_BASE_URL")}
            placeholder="https://api.minimaxi.com/v1"
            helperText="OpenAI-compatible endpoint for MiniMax text and multimodal models."
          />
        ) : null}

        {selectedProvider === "deepseek" ? (
          <Collapsible
            open={deepseekAdvancedOpen}
            onOpenChange={onDeepseekAdvancedOpenChange}
            className="mt-3"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-[#F9F9FA] px-3 py-2.5 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100"
              >
                <span>Advanced settings</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-gray-600 transition-transform duration-200",
                    deepseekAdvancedOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 overflow-hidden">
              <div className="space-y-1.5 border-t border-gray-100 pt-3">
                <label className="block text-sm font-medium text-gray-700">
                  DeepSeek base URL (optional)
                </label>
                <input
                  type="text"
                  value={llmConfig.DEEPSEEK_BASE_URL || ""}
                  onChange={(event) => {
                    onDeepseekAdvancedOpenChange(true);
                    onInputChange(event.target.value, "DEEPSEEK_BASE_URL");
                  }}
                  className={inputClassName}
                  placeholder="https://api.deepseek.com/v1"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {selectedProvider === "litellm" ? (
          <LabeledTextField
            label="LiteLLM base URL"
            value={llmConfig.LITELLM_BASE_URL || ""}
            onChange={(value) => onInputChange(value, "LITELLM_BASE_URL")}
            placeholder="e.g. http://host.docker.internal:4000/v1"
            helperText="OpenAI-compatible root (usually ends with /v1); /v1 is added if omitted. API key above is optional for local proxies with no auth."
          />
        ) : null}

        {selectedProvider === "lmstudio" ? (
          <LabeledTextField
            label="LM Studio base URL"
            value={llmConfig.LMSTUDIO_BASE_URL || ""}
            onChange={(value) => onInputChange(value, "LMSTUDIO_BASE_URL")}
            placeholder="http://localhost:1234/v1"
            helperText="Defaults to localhost:1234/v1, and /v1 is added automatically when omitted."
          />
        ) : null}

        {selectedProvider === "fireworks" ? (
          <LabeledTextField
            label="Fireworks base URL (optional)"
            value={llmConfig.FIREWORKS_BASE_URL || ""}
            onChange={(value) => onInputChange(value, "FIREWORKS_BASE_URL")}
            placeholder="https://api.fireworks.ai/inference/v1"
          />
        ) : null}

        {selectedProvider === "together" ? (
          <LabeledTextField
            label="Together base URL (optional)"
            value={llmConfig.TOGETHER_BASE_URL || ""}
            onChange={(value) => onInputChange(value, "TOGETHER_BASE_URL")}
            placeholder="https://api.together.ai/v1"
          />
        ) : null}

        {selectedProvider === "vertex" || selectedProvider === "azure" ? (
          <VertexAzureManualFields
            key={selectedProvider}
            provider={selectedProvider}
            llmConfig={llmConfig}
            onPatch={(patch) => applyConfigPatch(onInputChange, patch)}
          />
        ) : null}
      </div>

      {showModelCheckButton ? (
        <button
          onClick={onFetchModels}
          disabled={modelsLoading || !canFetchModels}
          className={cn(
            "mt-4 w-fit rounded-[48px] border bg-[#EDEEEF] px-3.5 py-2.5 text-xs font-semibold text-[#101323] transition-all duration-200",
            modelsLoading
              ? "cursor-not-allowed border-gray-300 text-gray-500"
              : "border-[#EDEEEF] text-[#101323] hover:bg-[#E8F0FF]/90 focus:ring-2 focus:ring-blue-500/20"
          )}
        >
          {modelsLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking for models...
            </span>
          ) : (
            "Check models"
          )}
        </button>
      ) : null}
    </>
  );
};

export default TextProviderFields;
