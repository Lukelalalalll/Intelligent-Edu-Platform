import { type Locale } from "@/shared/i18n";

import { LanguageType } from "../upload/type";

const LEGACY_CHINESE_SIMPLIFIED = "Chinese (Simplified - 涓枃, 姹夎)";
const LEGACY_CHINESE_TRADITIONAL = "Chinese (Traditional - 涓枃, 婕㈣獮)";

export const GENERATION_LANGUAGE_FOLLOW_LOCALE: Record<Locale, LanguageType> = {
  en: LanguageType.English,
  "zh-CN": LanguageType.ChineseSimplified,
  "zh-HK": LanguageType.CantoneseTraditional,
};

export function getGenerationLanguageForLocale(locale: Locale): LanguageType {
  return GENERATION_LANGUAGE_FOLLOW_LOCALE[locale] ?? LanguageType.English;
}

export function normalizeGenerationLanguage(
  language: string | null | undefined
): LanguageType | null {
  if (language == null) return null;

  const value = String(language).trim();
  if (!value) return null;

  switch (value) {
    case "en":
    case "en-US":
    case "en-GB":
    case LanguageType.English:
      return LanguageType.English;
    case "zh-CN":
    case LEGACY_CHINESE_SIMPLIFIED:
    case LanguageType.ChineseSimplified:
      return LanguageType.ChineseSimplified;
    case "zh-HK":
    case "zh-MO":
    case LanguageType.CantoneseTraditional:
      return LanguageType.CantoneseTraditional;
    case "zh-TW":
    case LEGACY_CHINESE_TRADITIONAL:
    case LanguageType.ChineseTraditional:
      return LanguageType.ChineseTraditional;
    case LanguageType.Auto:
      return LanguageType.Auto;
    default: {
      const directMatch = Object.values(LanguageType).find((option) => option === value);
      return directMatch ?? null;
    }
  }
}

export function getGenerationLanguageLabel(
  language: string | null | undefined
): string {
  return normalizeGenerationLanguage(language) ?? String(language || "").trim();
}
