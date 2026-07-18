import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { detectLocaleFromBrowserLanguage, I18nProvider, useI18n } from './index';
import { TRANSLATIONS } from './translations';

function TranslationProbe() {
  const { locale, t } = useI18n();

  return (
    <>
      <div data-testid="active-locale">{locale}</div>
      <div data-testid="upload-title">{t('ppt_generator.upload.banner.title')}</div>
      <div data-testid="workflow-preview">{t('ppt_generator.workflow.step.preview')}</div>
      <div data-testid="nav-login">{t('nav.login')}</div>
      <div data-testid="footer-copy">{t('footer.copyright')}</div>
    </>
  );
}

function setNavigatorLanguages(language: string, languages = [language]) {
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

describe('I18nProvider', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });

    window.localStorage.clear();
    setNavigatorLanguages('en-US');
    document.documentElement.lang = '';
    delete document.documentElement.dataset.locale;
  });

  it('renders zh-CN PPT and shared strings from localStorage', async () => {
    window.localStorage.setItem('appLanguage', 'zh-CN');

    render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('upload-title').textContent).toBe(
      TRANSLATIONS['zh-CN']['ppt_generator.upload.banner.title'],
    );
    expect(screen.getByTestId('nav-login').textContent).toBe(TRANSLATIONS['zh-CN']['nav.login']);
    expect(screen.getByTestId('footer-copy').textContent).toBe(
      TRANSLATIONS['zh-CN']['footer.copyright'],
    );

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('zh-CN');
      expect(document.documentElement.dataset.locale).toBe('zh-CN');
    });
  });

  it('restores zh-TW from localStorage and updates html attributes', async () => {
    window.localStorage.setItem('appLanguage', 'zh-TW');

    render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('active-locale').textContent).toBe('zh-TW');
    expect(screen.getByTestId('upload-title').textContent).toBe(
      TRANSLATIONS['zh-TW']['ppt_generator.upload.banner.title'],
    );
    expect(screen.getByTestId('nav-login').textContent).toBe(TRANSLATIONS['zh-TW']['nav.login']);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('zh-TW');
      expect(document.documentElement.dataset.locale).toBe('zh-TW');
    });
  });

  it('renders zh-HK workflow copy for the new step labels', () => {
    window.localStorage.setItem('appLanguage', 'zh-HK');

    render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('workflow-preview').textContent).toBe(
      TRANSLATIONS['zh-HK']['ppt_generator.workflow.step.preview'],
    );
  });

  it('detects zh-TW browser language when no stored locale exists', async () => {
    setNavigatorLanguages('zh-TW');

    render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('active-locale').textContent).toBe('zh-TW');
    expect(screen.getByTestId('upload-title').textContent).toBe(
      TRANSLATIONS['zh-TW']['ppt_generator.upload.banner.title'],
    );

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('zh-TW');
      expect(document.documentElement.dataset.locale).toBe('zh-TW');
    });
  });

  it('maps browser Chinese variants to the expected locale', () => {
    expect(detectLocaleFromBrowserLanguage('zh-TW')).toBe('zh-TW');
    expect(detectLocaleFromBrowserLanguage('zh-Hant')).toBe('zh-TW');
    expect(detectLocaleFromBrowserLanguage('zh-Hant-TW')).toBe('zh-TW');
    expect(detectLocaleFromBrowserLanguage('zh-Hant-HK')).toBe('zh-HK');
    expect(detectLocaleFromBrowserLanguage('zh-MO')).toBe('zh-HK');
    expect(detectLocaleFromBrowserLanguage('yue-Hant-HK')).toBe('zh-HK');
    expect(detectLocaleFromBrowserLanguage('zh-Hans-CN')).toBe('zh-CN');
  });
});
