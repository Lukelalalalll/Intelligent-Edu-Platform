import type { MessageDictionary } from "../types";

export const enSharedLanguageMessages = {
  "language.en": "English",
  "language.switcher.label": "Change language",
  "language.switcher.title": "Language",
  "language.zhCN": "Simplified Chinese",
  "language.zhHK": "Cantonese Traditional",
} as const satisfies MessageDictionary;

export const zhCNSharedLanguageMessages = {
  "language.en": "\u82f1\u6587",
  "language.switcher.label": "\u5207\u6362\u8bed\u8a00",
  "language.switcher.title": "\u8bed\u8a00",
  "language.zhCN": "\u7b80\u4f53\u4e2d\u6587",
  "language.zhHK": "\u7ca4\u8bed\u7e41\u4f53",
} as const satisfies MessageDictionary;

export const zhHKSharedLanguageMessages = {
  "language.en": "\u82f1\u6587",
  "language.switcher.label": "\u5207\u63db\u8a9e\u8a00",
  "language.switcher.title": "\u8a9e\u8a00",
  "language.zhCN": "\u7c21\u9ad4\u4e2d\u6587",
  "language.zhHK": "\u7cb5\u8a9e\u7e41\u9ad4",
} as const satisfies MessageDictionary;
