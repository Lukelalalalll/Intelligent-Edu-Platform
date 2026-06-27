import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdvanceSettings from "./AdvanceSettings";
import { PresentationConfig, ToneType, VerbosityType } from "../type";

vi.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "presenton.upload.advanced.tooltip": "Advanced settings",
        "presenton.upload.advanced.dialog": "Advanced settings",
        "presenton.upload.advanced.close": "Close advanced settings",
        "presenton.upload.advanced.title": "Advanced Settings",
        "presenton.upload.advanced.subtitle": "Adjust presentation behavior",
        "presenton.upload.advanced.save": "Save",
        "presenton.upload.advanced.instructions.label": "Write instructions",
        "presenton.upload.advanced.instructions.placeholder":
          "Guide the AI: define audience, tone, key points, or constraints.",
        "presenton.upload.advanced.tone": "Tone",
        "presenton.upload.advanced.tone.placeholder": "Select tone",
        "presenton.upload.advanced.verbosity": "Verbosity",
        "presenton.upload.advanced.verbosity.placeholder": "Select verbosity",
        "presenton.upload.advanced.includeToc": "Include table of contents",
        "presenton.upload.advanced.includeTitle": "Title slide",
      }[key] ?? key),
  }),
}));

vi.mock("@/components/ToolTip", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseConfig: PresentationConfig = {
  slides: null,
  language: null,
  prompt: "",
  tone: ToneType.Default,
  verbosity: VerbosityType.Standard,
  instructions: "Existing instructions",
  includeTableOfContents: false,
  includeTitleSlide: true,
  webSearch: false,
};

function renderAdvanceSettings(
  overrides: Partial<PresentationConfig> = {},
  onConfigChange = vi.fn()
) {
  render(
    <AdvanceSettings
      config={{ ...baseConfig, ...overrides }}
      onConfigChange={onConfigChange}
    />
  );

  return { onConfigChange };
}

describe("AdvanceSettings", () => {
  it("renders a trigger with visible text", () => {
    renderAdvanceSettings();

    const trigger = screen.getByTestId("advanced-settings-button");
    expect(trigger).toHaveTextContent("Advanced Settings");
    expect(
      screen.getByRole("button", { name: /advanced settings/i })
    ).toBeInTheDocument();
  });

  it("opens a centered dialog with the existing fields", () => {
    renderAdvanceSettings();

    fireEvent.click(screen.getByTestId("advanced-settings-button"));

    expect(
      screen.getByRole("dialog", { name: /advanced settings/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Write instructions")).toHaveValue(
      "Existing instructions"
    );
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.getByText("Verbosity")).toBeInTheDocument();
    expect(screen.getByText("Include table of contents")).toBeInTheDocument();
    expect(screen.getByText("Title slide")).toBeInTheDocument();
  });

  it("closes on overlay click without saving draft changes", async () => {
    const { onConfigChange } = renderAdvanceSettings();

    fireEvent.click(screen.getByTestId("advanced-settings-button"));
    fireEvent.change(screen.getByLabelText("Write instructions"), {
      target: { value: "Updated instructions" },
    });
    fireEvent.click(screen.getByTestId("advanced-settings-overlay"));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /advanced settings/i })
      ).not.toBeInTheDocument();
    });
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("closes on escape without saving draft changes", async () => {
    const { onConfigChange } = renderAdvanceSettings();

    fireEvent.click(screen.getByTestId("advanced-settings-button"));
    fireEvent.change(screen.getByLabelText("Write instructions"), {
      target: { value: "Escaped instructions" },
    });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /advanced settings/i })
      ).not.toBeInTheDocument();
    });
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("saves all advanced settings only when save is clicked", async () => {
    const { onConfigChange } = renderAdvanceSettings();

    fireEvent.click(screen.getByTestId("advanced-settings-button"));
    fireEvent.change(screen.getByLabelText("Write instructions"), {
      target: { value: "Save these instructions" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onConfigChange).toHaveBeenCalledTimes(5);
    expect(onConfigChange).toHaveBeenNthCalledWith(1, "tone", ToneType.Default);
    expect(onConfigChange).toHaveBeenNthCalledWith(
      2,
      "verbosity",
      VerbosityType.Standard
    );
    expect(onConfigChange).toHaveBeenNthCalledWith(
      3,
      "instructions",
      "Save these instructions"
    );
    expect(onConfigChange).toHaveBeenNthCalledWith(
      4,
      "includeTableOfContents",
      false
    );
    expect(onConfigChange).toHaveBeenNthCalledWith(5, "includeTitleSlide", true);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /advanced settings/i })
      ).not.toBeInTheDocument();
    });
  });
});
