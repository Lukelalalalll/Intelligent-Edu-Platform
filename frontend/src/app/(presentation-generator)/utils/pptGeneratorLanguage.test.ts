import { describe, expect, it } from "vitest";

import { LanguageType } from "../upload/type";
import {
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
});
