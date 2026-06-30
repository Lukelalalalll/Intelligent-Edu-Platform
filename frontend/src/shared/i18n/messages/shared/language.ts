import type { MessageDictionary } from "../types";

export const enSharedLanguageMessages = {
  "language.en": "English",
  "language.switcher.label": "Change language",
  "language.switcher.title": "Language",
  "language.zhCN": "Simplified Chinese",
  "language.zhHK": "Cantonese Traditional",
} as const satisfies MessageDictionary;


export const zhCNSharedLanguageMessages = {
  "language.en": "英文",
  "language.switcher.label": "切换语言",
  "language.switcher.title": "语言",
  "language.zhCN": "简体中文",
  "language.zhHK": "粤语繁体",
} as const satisfies MessageDictionary;


export const zhHKSharedLanguageMessages = {
  "language.en": "英文",
  "language.switcher.label": "切換語言",
  "language.switcher.title": "語言",
  "language.zhCN": "簡體中文",
  "language.zhHK": "粵語繁體",
} as const satisfies MessageDictionary;
