import { describe, expect, it } from 'vitest';

import { enMessages, mergeMessages, zhCNMessages, zhHKMessages } from './messages';
import { LOCALE_OPTIONS, TRANSLATIONS } from './translations';

describe('translation assembly', () => {
  it('exposes valid locale labels', () => {
    expect(LOCALE_OPTIONS).toEqual([
      { code: 'en', label: 'English', shortLabel: 'EN', htmlLang: 'en' },
      {
        code: 'zh-CN',
        label: '\u7b80\u4f53\u4e2d\u6587',
        shortLabel: '\u7b80',
        htmlLang: 'zh-CN',
      },
      {
        code: 'zh-HK',
        label: '\u7cb5\u8a9e\u7e41\u9ad4',
        shortLabel: '\u7e41',
        htmlLang: 'zh-HK',
      },
    ]);
  });

  it('assembles each locale dictionary with working sentinel keys', () => {
    expect(TRANSLATIONS.en).toBe(enMessages);
    expect(TRANSLATIONS['zh-CN']).toBe(zhCNMessages);
    expect(TRANSLATIONS['zh-HK']).toBe(zhHKMessages);

    expect(TRANSLATIONS.en['ppt_generator.workflow.step.prepare']).toBe('Prompt & Files');
    expect(TRANSLATIONS['zh-CN']['ppt_generator.upload.banner.title']).toBe(
      '\u751f\u6210\u6f14\u793a\u6587\u7a3f',
    );
    expect(TRANSLATIONS['zh-CN']['ppt_generator.upload.prompt.label']).toBe(
      '\u8f93\u5165\u63d0\u793a\u8bcd',
    );
    expect(TRANSLATIONS['zh-CN']['ppt_generator.templates.banner.title']).toBe(
      '\u6a21\u677f\u5e93',
    );
    expect(TRANSLATIONS['zh-CN']['ppt_generator.settings.privacy.title']).toBe(
      '\u4f7f\u7528\u5206\u6790',
    );
    expect(TRANSLATIONS['zh-CN']['ppt_generator.customTemplate.page.title']).toBe(
      '\u6a21\u677f\u5de5\u4f5c\u5ba4',
    );
    expect(TRANSLATIONS['zh-HK']['ppt_generator.workflow.step.preview']).toBe(
      '\u751f\u6210 PPT \u9810\u89bd',
    );
    expect(TRANSLATIONS['zh-HK']['ppt_generator.templates.controls.create']).toBe(
      '\u65b0\u589e\u6a21\u677f',
    );
    expect(TRANSLATIONS['zh-HK']['ppt_generator.customTemplate.page.title']).toBe(
      '\u6a21\u677f\u5de5\u4f5c\u5ba4',
    );
    expect(TRANSLATIONS['zh-CN']['language.switcher.title']).toBe('\u8bed\u8a00');
    expect(TRANSLATIONS['zh-HK']['language.switcher.title']).toBe('\u8a9e\u8a00');
  });

  it('keeps english fallback values in locale dictionaries when overrides are absent', () => {
    expect(TRANSLATIONS['zh-CN']['footer.copyright']).toBe(enMessages['footer.copyright']);
    expect(TRANSLATIONS['zh-HK']['footer.copyright']).toBe(enMessages['footer.copyright']);
  });

  it('throws when duplicate translation keys are merged into the same section', () => {
    expect(() => mergeMessages({ 'shared.example': 'one' }, { 'shared.example': 'two' })).toThrow(
      'Duplicate translation key detected: shared.example',
    );
  });
});
