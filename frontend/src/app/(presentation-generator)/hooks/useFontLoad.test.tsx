import { beforeEach, describe, expect, it } from "vitest";
import {
  useFontLoader,
  type FontLoadResult,
} from "./useFontLoad";

const getStylesheetLinks = () =>
  Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));

const getFontFaceStyles = () =>
  Array.from(document.head.querySelectorAll("style[data-font-key]"));

describe("useFontLoader", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("allows same-origin stylesheets and Google Fonts CSS", () => {
    const result = useFontLoader({
      Inter: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
      LocalSans: "/fonts/local-sans.css",
    });

    expect(result.loaded).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(getStylesheetLinks()).toHaveLength(2);
  });

  it("allows same-origin font files and rejects external font binaries", () => {
    const result = useFontLoader({
      LocalSans: "/fonts/local-sans.woff2",
      RemoteSans: "https://example.com/fonts/remote-sans.woff2",
    });

    expect(result.loaded).toEqual([
      expect.objectContaining({
        name: "LocalSans",
        strategy: "font-face",
      }),
    ]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        name: "RemoteSans",
        reason: "unsupported_font_origin",
      }),
    ]);
    expect(getFontFaceStyles()).toHaveLength(1);
  });

  it("returns a structured result even when a font source is invalid", () => {
    const result: FontLoadResult = useFontLoader({
      BrokenFont: "http://[broken-url",
    });

    expect(result.loaded).toHaveLength(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        name: "BrokenFont",
        reason: "invalid_url",
      }),
    ]);
  });
});
