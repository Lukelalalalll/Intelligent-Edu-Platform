import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  TRANSLATIONS,
  type Locale,
  type TranslationKey,
} from './translations';
import { log } from '../utils/logger';

const STORAGE_KEY = 'appLanguage';

type TranslationVars = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  locales: typeof LOCALE_OPTIONS;
  setLocale: (nextLocale: Locale) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
let hasLoggedMissingProvider = false;

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALE_OPTIONS.some((option) => option.code === value);
}

export function applyLocale(locale: Locale) {
  const option = LOCALE_OPTIONS.find((item) => item.code === locale);
  document.documentElement.lang = option?.htmlLang ?? locale;
  document.documentElement.dataset.locale = locale;
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const storedLocale = window.localStorage.getItem(STORAGE_KEY);
  if (isLocale(storedLocale)) return storedLocale;

  const browserLocale = window.navigator.language.toLowerCase();
  if (
    browserLocale.startsWith('yue') ||
    browserLocale.includes('hant') ||
    browserLocale.startsWith('zh-hk') ||
    browserLocale.startsWith('zh-mo') ||
    browserLocale.startsWith('zh-tw')
  ) {
    return 'zh-HK';
  }
  if (browserLocale.startsWith('zh')) return 'zh-CN';

  return DEFAULT_LOCALE;
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    applyLocale(nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) => {
      const template = TRANSLATIONS[locale][key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
      return interpolate(template, vars);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales: LOCALE_OPTIONS,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function buildTranslator(locale: Locale) {
  return (key: TranslationKey, vars?: TranslationVars) => {
    const template = TRANSLATIONS[locale][key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
    return interpolate(template, vars);
  };
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context) {
    return context;
  }

  const locale = detectInitialLocale();

  if (!hasLoggedMissingProvider) {
    hasLoggedMissingProvider = true;
    log.error('i18n', 'useI18n called without I18nProvider, falling back to default context');
  }

  return {
    locale,
    locales: LOCALE_OPTIONS,
    setLocale: (nextLocale: Locale) => {
      applyLocale(nextLocale);
      log.warn('i18n', 'Applied locale without provider state; UI will fully sync after remount', { nextLocale });
    },
    t: buildTranslator(locale),
  };
}
