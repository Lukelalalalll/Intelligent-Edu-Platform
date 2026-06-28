import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CurrentConfig from "./CurrentConfig";

vi.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "ppt_generator.upload.currentConfig.text": "Text",
        "ppt_generator.upload.currentConfig.images": "Images",
        "ppt_generator.upload.currentConfig.web": "Web",
        "ppt_generator.upload.currentConfig.imagesDisabled": "Image generation disabled",
        "ppt_generator.upload.currentConfig.noImageProvider": "No image provider",
        "ppt_generator.upload.currentConfig.webState.on": "On",
        "ppt_generator.upload.currentConfig.webState.off": "Off",
        "ppt_generator.upload.currentConfig.configured": "宸查厤缃?,
        "ppt_generator.upload.currentConfig.unconfigured": "鏈厤缃?,
        "ppt_generator.upload.currentConfig.selected": "褰撳墠浣跨敤",
        "ppt_generator.upload.currentConfig.defaultModel": "Default model",
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

    expect(screen.getByText("宸查厤缃?)).toBeInTheDocument();
    expect(screen.getByText("鏈厤缃?)).toBeInTheDocument();
    expect(screen.getByText("褰撳墠浣跨敤")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /OpenAI/i }));
    expect(onProviderSelect).toHaveBeenCalledWith("openai");

    expect(screen.getByRole("button", { name: /DeepSeek/i })).toBeDisabled();
  });
});

