import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTemplateCreation } from "./useTemplateCreation";
import type { FontData, FontItem } from "../types";
import { fontResolutionKey } from "../types";

const notify = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify,
}));

vi.mock("@/app/(presentation-generator)/services/api/header", () => ({
  getHeader: () => ({}),
  getHeaderForFormData: () => ({}),
}));

vi.mock("@/utils/api", () => ({
  getApiUrl: (path: string) => path,
}));

vi.mock("@/utils/mixpanel", () => ({
  MixpanelEvent: {
    CustomTemplate_Creation_Started: "CustomTemplate_Creation_Started",
    CustomTemplate_Creation_Completed: "CustomTemplate_Creation_Completed",
  },
  trackEvent: vi.fn(),
}));

vi.mock("@/app/hooks/compileLayout", () => ({
  compileCustomLayout: () => true,
}));

const availableFont: FontItem = {
  name: "Inter Regular",
  url: "https://fonts.googleapis.com/css2?family=Inter&display=swap",
  family_name: "Inter",
  variant: "regular",
  original_name: "Inter",
};

const missingFont: FontItem = {
  name: "Brand Sans Regular",
  url: null,
  family_name: "Brand Sans",
  variant: "regular",
  original_name: "Brand Sans",
};

const otherMissingFont: FontItem = {
  name: "Corp Serif Bold",
  url: null,
  family_name: "Corp Serif",
  variant: "bold",
  original_name: "Corp Serif Bold",
};

function seedFonts(result: { current: ReturnType<typeof useTemplateCreation> }) {
  const fontsData: FontData = {
    available_fonts: [availableFont],
    unavailable_fonts: [missingFont, otherMissingFont],
  };

  act(() => {
    result.current.updateState({ fontsData });
  });
}

describe("useTemplateCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notify.error.mockReset();
    notify.info.mockReset();
    notify.success.mockReset();
    notify.warning.mockReset();
    global.fetch = vi.fn();
  });

  it("only reports all fonts resolved after every missing entry has a resolution", () => {
    const { result } = renderHook(() => useTemplateCreation());

    seedFonts(result);

    expect(result.current.allFontsResolved()).toBe(false);

    act(() => {
      result.current.setFontReplacement(missingFont, availableFont);
    });

    expect(result.current.allFontsResolved()).toBe(false);

    const uploadFile = new File(["font"], "corp-serif-bold.ttf", {
      type: "font/ttf",
    });

    act(() => {
      result.current.uploadFont(otherMissingFont, uploadFile);
    });

    expect(result.current.allFontsResolved()).toBe(true);
  });

  it("uploading overrides a replacement for the same row, and removing the upload makes it unresolved again", () => {
    const { result } = renderHook(() => useTemplateCreation());

    act(() => {
      result.current.updateState({
        fontsData: {
          available_fonts: [availableFont],
          unavailable_fonts: [missingFont],
        },
      });
    });

    act(() => {
      result.current.setFontReplacement(missingFont, availableFont);
    });

    const resolutionKey = fontResolutionKey(missingFont);
    expect(result.current.fontResolutionsByKey[resolutionKey]?.type).toBe(
      "replacement"
    );

    const uploadFile = new File(["font"], "brand-sans.ttf", { type: "font/ttf" });
    act(() => {
      result.current.uploadFont(missingFont, uploadFile);
    });

    expect(result.current.fontResolutionsByKey[resolutionKey]?.type).toBe("upload");
    expect(result.current.uploadedFonts[0]?.resolutionKey).toBe(resolutionKey);

    act(() => {
      result.current.removeFont(resolutionKey);
    });

    expect(result.current.fontResolutionsByKey[resolutionKey]).toBeUndefined();
    expect(result.current.allFontsResolved()).toBe(false);
  });

  it("submits both uploaded font files and selected replacements during preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          slide_image_urls: [],
          pptx_url: "/app_data/deck.pptx",
          modified_pptx_url: "/app_data/deck.pptx",
          render_mode: "pptx_to_html",
          fonts: {
            Inter:
              "https://fonts.googleapis.com/css2?family=Inter&display=swap",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    const { result } = renderHook(() => useTemplateCreation());

    seedFonts(result);

    act(() => {
      result.current.setFontReplacement(missingFont, availableFont);
    });

    const uploadFile = new File(["font"], "corp-serif-bold.ttf", {
      type: "font/ttf",
    });
    act(() => {
      result.current.uploadFont(otherMissingFont, uploadFile);
    });

    await act(async () => {
      await result.current.fontUploadAndPreview(
        new File(["pptx"], "deck.pptx", {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        })
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    const formData = requestInit?.body as FormData;

    expect(formData.getAll("font_files")).toHaveLength(1);
    expect(formData.getAll("original_font_names")).toEqual(["Corp Serif Bold"]);

    const replacementPayload = JSON.parse(
      String(formData.get("font_replacements"))
    );
    expect(replacementPayload).toEqual([
      {
        original_name: "Brand Sans",
        original_variant: "regular",
        replacement_family_name: "Inter",
        replacement_variant: "regular",
        replacement_label: "Inter Regular",
      },
    ]);
  });
});

