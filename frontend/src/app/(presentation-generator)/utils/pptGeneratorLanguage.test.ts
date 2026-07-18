import { describe, expect, it } from "vitest";

import { LanguageType } from "../upload/type";
import {
  getGenerationLanguageForLocale,
  getGenerationLanguageLabel,
  normalizeGenerationLanguage,
} from "./pptGeneratorLanguage";

describe("pptGeneratorLanguage", () => {
  it("normalizes legacy Cantonese labels to the corrected value", () => {
    const legacyValue = "Cantonese (Traditional - 绮佃獮绻侀珨)";

    expect(normalizeGenerationLanguage(legacyValue)).toBe(
      LanguageType.CantoneseTraditional
    );
    expect(getGenerationLanguageLabel(legacyValue)).toBe(
      LanguageType.CantoneseTraditional
    );
  });

  it("maps UI locales to generation languages", () => {
    expect(getGenerationLanguageForLocale("en")).toBe(LanguageType.English);
    expect(getGenerationLanguageForLocale("zh-CN")).toBe(
      LanguageType.ChineseSimplified
    );
    expect(getGenerationLanguageForLocale("zh-HK")).toBe(
      LanguageType.CantoneseTraditional
    );
    expect(getGenerationLanguageForLocale("zh-TW")).toBe(
      LanguageType.ChineseTraditional
    );
  });
});
