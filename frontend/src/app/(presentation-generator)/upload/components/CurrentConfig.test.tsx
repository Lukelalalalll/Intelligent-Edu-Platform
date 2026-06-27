import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CurrentConfig from "./CurrentConfig";

vi.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "presenton.upload.currentConfig.text": "Text",
        "presenton.upload.currentConfig.images": "Images",
        "presenton.upload.currentConfig.web": "Web",
        "presenton.upload.currentConfig.imagesDisabled": "Image generation disabled",
        "presenton.upload.currentConfig.noImageProvider": "No image provider",
        "presenton.upload.currentConfig.webState.on": "On",
        "presenton.upload.currentConfig.webState.off": "Off",
        "presenton.upload.currentConfig.configured": "已配置",
        "presenton.upload.currentConfig.unconfigured": "未配置",
        "presenton.upload.currentConfig.selected": "当前使用",
        "presenton.upload.currentConfig.defaultModel": "Default model",
      }[key] ?? key),
  }),
}));

describe("CurrentConfig", () => {
  it("renders configured and unconfigured provider cards with selection state", () => {
    const onProviderSelect = vi.fn();

    render(
      <CurrentConfig
        llmConfig={{
          LLM: "openai",
          OPENAI_MODEL: "gpt-5.5",
          DISABLE_IMAGE_GENERATION: true,
          WEB_SEARCH_PROVIDER: "auto",
        }}
        providerCards={[
          {
            id: "openai",
            label: "OpenAI",
            configured: true,
            model: "gpt-5.5",
          },
          {
            id: "deepseek",
            label: "DeepSeek",
            configured: false,
            model: "deepseek-v4-pro",
          },
        ]}
        selectedProvider="openai"
        webSearchEnabled={false}
        onProviderSelect={onProviderSelect}
      />
    );

    expect(screen.getByText("已配置")).toBeInTheDocument();
    expect(screen.getByText("未配置")).toBeInTheDocument();
    expect(screen.getByText("当前使用")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /OpenAI/i }));
    expect(onProviderSelect).toHaveBeenCalledWith("openai");

    expect(screen.getByRole("button", { name: /DeepSeek/i })).toBeDisabled();
  });
});
