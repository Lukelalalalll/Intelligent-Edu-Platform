import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import FontManager from "./FontManager";
import type { FontItem, FontManagerProps } from "../types";
import { fontResolutionKey } from "../types";

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

function buildProps(overrides: Partial<FontManagerProps> = {}): FontManagerProps {
  return {
    fontsData: {
      available_fonts: [availableFont],
      unavailable_fonts: [missingFont],
    },
    fontResolutionsByKey: {},
    uploadedFonts: [],
    uploadFont: vi.fn(),
    removeFont: vi.fn(),
    setFontReplacement: vi.fn(),
    allFontsResolved: false,
    onContinue: vi.fn(),
    isUploading: false,
    ...overrides,
  };
}

describe("FontManager", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  it("keeps the preview CTA disabled until every missing font is resolved", () => {
    const unresolvedProps = buildProps();
    const { rerender } = render(<FontManager {...unresolvedProps} />);

    expect(
      screen.getByRole("button", { name: "Resolve All Missing Fonts First" })
    ).toBeDisabled();

    rerender(
      <FontManager
        {...buildProps({
          allFontsResolved: true,
          fontResolutionsByKey: {
            [fontResolutionKey(missingFont)]: {
              type: "replacement",
              selection: {
                original_name: "Brand Sans",
                original_variant: "regular",
                replacement_family_name: "Inter",
                replacement_variant: "regular",
                replacement_label: "Inter Regular",
              },
            },
          },
        })}
      />
    );

    expect(
      screen.getByRole("button", { name: "Continue to Preview" })
    ).toBeEnabled();
  });

  it("calls setFontReplacement when the user chooses a matched font", async () => {
    const user = userEvent.setup();
    const setFontReplacement = vi.fn();

    render(
      <FontManager
        {...buildProps({
          setFontReplacement,
        })}
      />
    );

    await user.click(screen.getByRole("combobox"));
    const fontOptions = await screen.findAllByText("Inter Regular");
    await user.click(fontOptions[fontOptions.length - 1]);

    expect(setFontReplacement).toHaveBeenCalledWith(missingFont, availableFont);
  });
});

