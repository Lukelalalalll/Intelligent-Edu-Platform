import { RootState } from '@/store/store';
import { IMAGE_PROVIDERS, LLM_PROVIDERS, WEB_SEARCH_PROVIDERS } from '@/utils/providerConstants';
import React from 'react'
import { useSelector } from 'react-redux';

const CurrentConfig = ({ webSearchEnabled }: { webSearchEnabled: boolean }) => {
    const userConfigState = useSelector((state: RootState) => state.userConfig);
    const llmConfig = userConfigState.llm_config;
    const textProviderKey = llmConfig.LLM || "openai";
    const textProviderLabel =
        LLM_PROVIDERS[textProviderKey]?.label || textProviderKey;
    const selectedTextModel =
        textProviderKey === "openai"
            ? llmConfig.OPENAI_MODEL
            : textProviderKey === "deepseek"
                ? llmConfig.DEEPSEEK_MODEL
            : textProviderKey === "google"
                ? llmConfig.GOOGLE_MODEL
                : textProviderKey === "vertex"
                    ? llmConfig.VERTEX_MODEL
                    : textProviderKey === "azure"
                        ? llmConfig.AZURE_OPENAI_MODEL
                        : textProviderKey === "bedrock"
                            ? llmConfig.BEDROCK_MODEL
                        : textProviderKey === "openrouter"
                            ? llmConfig.OPENROUTER_MODEL
                            : textProviderKey === "fireworks"
                                ? llmConfig.FIREWORKS_MODEL
                                : textProviderKey === "together"
                                    ? llmConfig.TOGETHER_MODEL
                            : textProviderKey === "cerebras"
                                ? llmConfig.CEREBRAS_MODEL
                                : textProviderKey === "litellm"
                                    ? llmConfig.LITELLM_MODEL
                                : textProviderKey === "lmstudio"
                                    ? llmConfig.LMSTUDIO_MODEL
                                : textProviderKey === "anthropic"
                                    ? llmConfig.ANTHROPIC_MODEL
                                    : textProviderKey === "ollama"
                                        ? llmConfig.OLLAMA_MODEL
                                        : textProviderKey === "custom"
                                            ? llmConfig.CUSTOM_MODEL
                                            : textProviderKey === "codex"
                                                ? llmConfig.CODEX_MODEL
                                                : "";
    const textSummary = selectedTextModel
        ? `${textProviderLabel} (${selectedTextModel})`
        : textProviderLabel;

    const imageSummary = llmConfig.DISABLE_IMAGE_GENERATION
        ? "Image generation disabled"
        : llmConfig.IMAGE_PROVIDER
            ? IMAGE_PROVIDERS[llmConfig.IMAGE_PROVIDER]?.label || llmConfig.IMAGE_PROVIDER
            : "No image provider";
    const webSearchProviderKey = (llmConfig.WEB_SEARCH_PROVIDER || "auto").toLowerCase();
    const webSearchProvider = 
        WEB_SEARCH_PROVIDERS[webSearchProviderKey]?.label || webSearchProviderKey;
    const webSearchSummary = `${webSearchProvider} (${webSearchEnabled ? "On" : "Off"})`;

    const items = [
        { label: "Text", value: textSummary },
        { label: "Images", value: imageSummary },
        { label: "Web", value: webSearchSummary },
    ];

    return (
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

    )
}

export default CurrentConfig
