import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider, useI18n } from './index';
import { TRANSLATIONS } from './translations';

function TranslationProbe() {
  const { t } = useI18n();

  return (
    <>
      <div data-testid="upload-title">{t('ppt_generator.upload.banner.title')}</div>
      <div data-testid="workflow-preview">{t('ppt_generator.workflow.step.preview')}</div>
      <div data-testid="nav-login">{t('nav.login')}</div>
      <div data-testid="footer-copy">{t('footer.copyright')}</div>
    </>
  );
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
    document.documentElement.lang = '';
    delete document.documentElement.dataset.locale;
  });

  it('renders zh-CN PPT and shared strings while preserving english fallback content', async () => {
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
    expect(screen.getByTestId('footer-copy').textContent).toBe(TRANSLATIONS.en['footer.copyright']);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('zh-CN');
      expect(document.documentElement.dataset.locale).toBe('zh-CN');
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
});
