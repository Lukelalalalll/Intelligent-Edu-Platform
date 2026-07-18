import { enMessages, zhCNMessages, zhHKMessages, zhTWMessages } from './messages';

export const LOCALE_OPTIONS = [
  { code: 'en', label: 'English', shortLabel: 'EN', htmlLang: 'en' },
  { code: 'zh-CN', label: '\u7b80\u4f53\u4e2d\u6587', shortLabel: '\u7b80', htmlLang: 'zh-CN' },
  {
    code: 'zh-HK',
    label: '\u7e41\u9ad4\u4e2d\u6587\uff08\u9999\u6e2f\u7cb5\u8a9e\uff09',
    shortLabel: '\u7cb5\u7e41',
    htmlLang: 'zh-HK',
  },
  {
    code: 'zh-TW',
    label: '\u7e41\u9ad4\u4e2d\u6587\uff08\u53f0\u7063\uff09',
    shortLabel: '\u53f0\u7e41',
    htmlLang: 'zh-TW',
  },
] as const;

export type Locale = (typeof LOCALE_OPTIONS)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

export type TranslationKey = keyof typeof enMessages;

export const TRANSLATIONS: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en: enMessages,
  'zh-CN': zhCNMessages,
  'zh-HK': zhHKMessages,
  'zh-TW': zhTWMessages,
};
