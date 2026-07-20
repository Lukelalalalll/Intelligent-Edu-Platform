import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/components/ui/sonner";
import { getApiUrl } from "@/utils/api";
import { LLMProviderOption } from "@/utils/providerConstants";
import { TextProviderInputChange, TextProviderModelOption } from "./types";
import {
  canFetchProviderModels,
  getOpenAiCompatibleUrl,
  getProviderModelLabel,
  pickPreferredModel,
} from "./utils";

interface UseTextProviderModelsParams {
  selectedProvider: string;
  selectedProviderMeta?: LLMProviderOption;
  currentModelField: string;
  currentModel: string;
  currentApiKey: string;
  currentCustomUrl: string;
  currentDeepseekBaseUrl: string;
  currentBigModelBaseUrl: string;
  currentMiniMaxBaseUrl: string;
  currentLitellmUrl: string;
  currentLmStudioUrl: string;
  currentFireworksUrl: string;
  currentTogetherUrl: string;
  onInputChange: TextProviderInputChange;
}

const normalizeModels = (data: unknown): TextProviderModelOption[] =>
  Array.isArray(data)
    ? data
        .filter((model): model is string => typeof model === "string")
        .map((model) => ({
          value: model,
          label: model,
        }))
    : [];

export const useTextProviderModels = ({
  selectedProvider,
  selectedProviderMeta,
  currentModelField,
  currentModel,
  currentApiKey,
  currentCustomUrl,
  currentDeepseekBaseUrl,
  currentBigModelBaseUrl,
  currentMiniMaxBaseUrl,
  currentLitellmUrl,
  currentLmStudioUrl,
  currentFireworksUrl,
  currentTogetherUrl,
  onInputChange,
}: UseTextProviderModelsParams) => {
  const [availableModels, setAvailableModels] = useState<
    TextProviderModelOption[]
  >([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsChecked, setModelsChecked] = useState(false);
  const isFirstRender = useRef(true);

  const canFetchModels = canFetchProviderModels({
    selectedProvider,
    currentApiKey,
    currentCustomUrl,
    currentLitellmUrl,
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (selectedProvider === "ollama") {
      return;
    }

    setAvailableModels([]);
    setModelsChecked(false);
    if (currentModelField) {
      onInputChange("", currentModelField);
    }
  }, [
    selectedProvider,
    currentApiKey,
    currentCustomUrl,
    currentDeepseekBaseUrl,
    currentBigModelBaseUrl,
    currentMiniMaxBaseUrl,
    currentLitellmUrl,
    currentLmStudioUrl,
    currentFireworksUrl,
    currentTogetherUrl,
    currentModelField,
    onInputChange,
  ]);

  const fetchAvailableModels = useCallback(async () => {
    if (!canFetchModels) {
      return;
    }

    setModelsLoading(true);
    try {
      let response: Response;

      if (selectedProvider === "google") {
        response = await fetch(
          getApiUrl("/api/v1/ppt/google/models/available"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              api_key: currentApiKey,
            }),
          }
        );
      } else if (selectedProvider === "anthropic") {
        response = await fetch(
          getApiUrl("/api/v1/ppt/anthropic/models/available"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              api_key: currentApiKey,
            }),
          }
        );
      } else {
        response = await fetch(
          getApiUrl("/api/v1/ppt/openai/models/available"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: getOpenAiCompatibleUrl({
                selectedProvider,
                selectedProviderMeta,
                currentCustomUrl,
                currentDeepseekBaseUrl,
                currentBigModelBaseUrl,
                currentMiniMaxBaseUrl,
                currentLitellmUrl,
                currentLmStudioUrl,
                currentFireworksUrl,
                currentTogetherUrl,
              }),
              api_key: currentApiKey,
            }),
          }
        );
      }

      if (!response.ok) {
        console.error("Failed to fetch models");
        setAvailableModels([]);
        setModelsChecked(true);
        notify.error(
          "Could not load models",
          `The server could not list ${getProviderModelLabel(
            selectedProvider,
            selectedProviderMeta
          )} models. Check your API key or endpoint and try again.`
        );
        return;
      }

      const normalizedModels = normalizeModels(await response.json());
      setAvailableModels(normalizedModels);
      setModelsChecked(true);

      if (normalizedModels.length === 0 || !currentModelField) {
        return;
      }

      const modelValues = normalizedModels.map((model) => model.value);
      if (currentModel && modelValues.includes(currentModel)) {
        onInputChange(currentModel, currentModelField);
        return;
      }

      onInputChange(
        pickPreferredModel(selectedProvider, modelValues),
        currentModelField
      );
    } catch (error) {
      console.error("Error fetching models:", error);
      notify.error(
        selectedProvider === "ollama"
          ? "Could not connect to Ollama"
          : "Could not load models",
        error instanceof Error
          ? error.message
          : "Something went wrong while contacting the provider. Check your network and try again."
      );
      setAvailableModels([]);
      setModelsChecked(true);
      if (selectedProvider === "ollama" && currentModelField) {
        onInputChange("", currentModelField);
      }
    } finally {
      setModelsLoading(false);
    }
  }, [
    canFetchModels,
    currentApiKey,
    currentCustomUrl,
    currentBigModelBaseUrl,
    currentDeepseekBaseUrl,
    currentFireworksUrl,
    currentLitellmUrl,
    currentLmStudioUrl,
    currentMiniMaxBaseUrl,
    currentModel,
    currentModelField,
    currentTogetherUrl,
    onInputChange,
    selectedProvider,
    selectedProviderMeta,
  ]);

  return {
    availableModels,
    canFetchModels,
    fetchAvailableModels,
    modelsChecked,
    modelsLoading,
  };
};
