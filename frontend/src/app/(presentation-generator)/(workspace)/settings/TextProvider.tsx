import { cn } from "@/lib/utils";
import React, { useState } from "react";
import TextProviderFields from "./text-provider/TextProviderFields";
import TextProviderModelSelect from "./text-provider/TextProviderModelSelect";
import TextProviderProviderSelect from "./text-provider/TextProviderProviderSelect";
import TextProviderSectionHeader from "./text-provider/TextProviderSectionHeader";
import { TextProviderProps } from "./text-provider/types";
import { useTextProviderModels } from "./text-provider/useTextProviderModels";
import {
  getConfigString,
  getProviderApiKeyField,
  getProviderMeta,
  getProviderModelField,
  getProviderModelLabel,
  getSelectedProvider,
  shouldUseAutoModelLookup,
} from "./text-provider/utils";

const TextProvider = ({ onInputChange, llmConfig }: TextProviderProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [deepseekAdvancedOpen, setDeepseekAdvancedOpen] = useState(() =>
    !!(llmConfig.DEEPSEEK_BASE_URL || "").trim()
  );

  const selectedProvider = getSelectedProvider(llmConfig);
  const selectedProviderMeta = getProviderMeta(selectedProvider);
  const shouldUseModelLookup = shouldUseAutoModelLookup(selectedProvider);
  const currentModelField = getProviderModelField(selectedProvider);
  const currentApiKeyField = getProviderApiKeyField(selectedProvider);
  const currentModel = getConfigString(llmConfig, currentModelField);
  const currentApiKey = getConfigString(llmConfig, currentApiKeyField);
  const currentCustomUrl = llmConfig.CUSTOM_LLM_URL || "";
  const currentDeepseekBaseUrl = (llmConfig.DEEPSEEK_BASE_URL || "").trim();
  const currentLitellmUrl = (llmConfig.LITELLM_BASE_URL || "").trim();
  const currentLmStudioUrl = (llmConfig.LMSTUDIO_BASE_URL || "").trim();
  const currentFireworksUrl = (llmConfig.FIREWORKS_BASE_URL || "").trim();
  const currentTogetherUrl = (llmConfig.TOGETHER_BASE_URL || "").trim();
  const currentOllamaUrl = llmConfig.OLLAMA_URL || "";
  const modelLabel = getProviderModelLabel(
    selectedProvider,
    selectedProviderMeta
  );

  const {
    availableModels,
    canFetchModels,
    fetchAvailableModels,
    modelsChecked,
    modelsLoading,
  } = useTextProviderModels({
    selectedProvider,
    selectedProviderMeta,
    currentModelField,
    currentModel,
    currentApiKey,
    currentCustomUrl,
    currentDeepseekBaseUrl,
    currentLitellmUrl,
    currentLmStudioUrl,
    currentFireworksUrl,
    currentTogetherUrl,
    onInputChange,
  });

  return (
    <div className="space-y-6 bg-[#F9F8F8] p-7 rounded-[12px] ">
      <div className="mb-4 flex flex-col gap-8 rounded-[12px] bg-white pt-5 pb-10 px-10 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <TextProviderSectionHeader />
        <div className="flex min-w-0 flex-1 flex-col items-stretch justify-end gap-4 sm:items-end">
          <div
            className={cn(
              "flex w-full min-w-0 flex-wrap gap-4 sm:justify-end",
              selectedProvider === "codex" ? "items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "relative shrink-0",
                selectedProvider === "codex" ? "w-[240px]" : "w-[262px]"
              )}
            >
              <TextProviderProviderSelect
                providerValue={llmConfig.LLM}
                currentOllamaUrl={currentOllamaUrl}
                onInputChange={onInputChange}
              />
            </div>
            <div
              className={cn(
                "relative flex min-w-0 flex-col justify-end",
                selectedProvider === "codex"
                  ? "w-[262px] max-w-full shrink-0 items-end"
                  : "w-[282px] shrink-0 max-w-full items-end"
              )}
            >
              <TextProviderFields
                llmConfig={llmConfig}
                selectedProvider={selectedProvider}
                currentApiKey={currentApiKey}
                currentCustomUrl={currentCustomUrl}
                currentOllamaUrl={currentOllamaUrl}
                onInputChange={onInputChange}
                showApiKey={showApiKey}
                onToggleShowApiKey={() => setShowApiKey((prev) => !prev)}
                deepseekAdvancedOpen={deepseekAdvancedOpen}
                onDeepseekAdvancedOpenChange={setDeepseekAdvancedOpen}
                shouldUseModelLookup={shouldUseModelLookup}
                canFetchModels={canFetchModels}
                modelsLoading={modelsLoading}
                modelsChecked={modelsChecked}
                availableModelsCount={availableModels.length}
                onFetchModels={fetchAvailableModels}
              />
            </div>
          </div>
          {shouldUseModelLookup && modelsChecked && availableModels.length > 0 ? (
            <div className="w-[262px]">
              <TextProviderModelSelect
                selectedProvider={selectedProvider}
                currentModel={currentModel}
                currentModelField={currentModelField}
                modelLabel={modelLabel}
                availableModels={availableModels}
                onInputChange={onInputChange}
              />
            </div>
          ) : null}
        </div>
      </div>
      {selectedProvider !== "ollama" &&
      modelsChecked &&
      availableModels.length === 0 ? (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            No models found. Please make sure your provider credentials are
            valid and the selected provider is reachable.
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default TextProvider;
