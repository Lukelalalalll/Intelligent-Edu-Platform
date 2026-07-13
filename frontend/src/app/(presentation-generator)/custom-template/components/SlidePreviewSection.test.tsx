import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SlidePreviewSection } from "./SlidePreviewSection";
import type { FontUploadPreviewResponse } from "../types";

vi.mock("@/utils/api", () => ({
  resolveBackendAssetUrl: (url: string) => `http://backend.local${url}`,
}));

const previewData: FontUploadPreviewResponse = {
  slide_image_urls: ["/slides/1.png", "/slides/2.png", "/slides/3.png"],
  pptx_url: "/deck.pptx",
  modified_pptx_url: "/deck-modified.pptx",
  render_mode: "libreoffice_png",
  preview_warning: "Preview used LibreOffice rasterization because PPTX-to-HTML conversion was unavailable for this deck.",
  fonts: {
    Inter: "https://fonts.googleapis.com/css2?family=Inter&display=swap",
  },
};

describe("SlidePreviewSection", () => {
  it("opens a modal preview and supports previous and next navigation", async () => {
    const user = userEvent.setup();

    render(
      <SlidePreviewSection
        previewData={previewData}
        onInitTemplate={vi.fn()}
        isLoading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Slide 2" }));

    expect(screen.getByRole("heading", { name: "Slide 2" })).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    const prevButton = screen.getByRole("button", { name: "Previous slide" });
    const nextButton = screen.getByRole("button", { name: "Next slide" });
    expect(prevButton).toBeEnabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);
    expect(screen.getByRole("heading", { name: "Slide 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(screen.getByRole("heading", { name: "Slide 2" })).toBeInTheDocument();
  });

  it("closes the modal via the dialog close button and surfaces preview warnings", async () => {
    const user = userEvent.setup();

    render(
      <SlidePreviewSection
        previewData={previewData}
        onInitTemplate={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getAllByText(/Preview used LibreOffice rasterization/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Slide 1" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { name: "Slide 1" })).not.toBeInTheDocument();
  });
});
