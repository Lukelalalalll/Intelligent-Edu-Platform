import { describe, expect, it } from 'vitest';

import {
  enMessages,
  extendMessages,
  mergeMessages,
  zhCNMessages,
  zhHKMessages,
  zhTWMessages,
} from './messages';
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
        label: '繁體中文（香港粵語）',
        shortLabel: '粵繁',
        htmlLang: 'zh-HK',
      },
      {
        code: 'zh-TW',
        label: '繁體中文（台灣）',
        shortLabel: '台繁',
        htmlLang: 'zh-TW',
      },
    ]);
  });

  it('assembles each locale dictionary with working sentinel keys', () => {
    expect(TRANSLATIONS.en).toBe(enMessages);
    expect(TRANSLATIONS['zh-CN']).toBe(zhCNMessages);
    expect(TRANSLATIONS['zh-HK']).toBe(zhHKMessages);
    expect(TRANSLATIONS['zh-TW']).toBe(zhTWMessages);

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
    expect(TRANSLATIONS['zh-CN']['home.tool.ppt_generator.title']).toBe(
      'PPT \u751f\u6210\u5668',
    );
    expect(TRANSLATIONS['zh-CN']['aiChat.workspace']).toBe('AI \u5de5\u4f5c\u533a');
    expect(TRANSLATIONS['zh-CN']['sidebar.section.aiTools']).toBe('AI \u5de5\u5177');
    expect(TRANSLATIONS['zh-CN']['sidebar.teacherView']).toBe('\u6559\u5e08\u89c6\u56fe');
    expect(TRANSLATIONS['zh-CN']['profile.editTitle']).toBe(
      '\u7f16\u8f91\u4e2a\u4eba\u8d44\u6599',
    );
    expect(TRANSLATIONS['zh-CN']['auth.username']).toBe('\u7528\u6237\u540d');
    expect(TRANSLATIONS['zh-HK']['ppt_generator.workflow.step.preview']).toBe(
      '\u751f\u6210 PPT \u9810\u89bd',
    );
    expect(TRANSLATIONS['zh-HK']['ppt_generator.templates.controls.create']).toBe(
      '\u65b0\u589e\u6a21\u677f',
    );
    expect(TRANSLATIONS['zh-HK']['ppt_generator.customTemplate.page.title']).toBe(
      '\u6a21\u677f\u5de5\u4f5c\u5ba4',
    );
    expect(TRANSLATIONS['zh-HK']['home.tool.video.title']).toBe(
      'AI \u5f71\u7247\u7522\u751f\u5668',
    );
    expect(TRANSLATIONS['zh-HK']['aiChat.workspace']).toBe('AI \u5de5\u4f5c\u5340');
    expect(TRANSLATIONS['zh-HK']['sidebar.section.workflow']).toBe('\u5de5\u4f5c\u6d41\u7a0b');
    expect(TRANSLATIONS['zh-HK']['sidebar.studentView']).toBe('\u5b78\u751f\u8996\u5716');
    expect(TRANSLATIONS['zh-HK']['profile.sessionsTitle']).toBe(
      '\u767b\u5165\u88dd\u7f6e\u7ba1\u7406',
    );
    expect(TRANSLATIONS['zh-HK']['auth.newPassword']).toBe('\u65b0\u5bc6\u78bc');
    expect(TRANSLATIONS['zh-TW']['language.zhTW']).toBe('繁體中文（台灣）');
    expect(TRANSLATIONS['zh-TW']['ppt_generator.upload.banner.title']).toBe('生成簡報');
    expect(TRANSLATIONS['zh-TW']['ppt_generator.templates.controls.create']).toBe('新增範本');
    expect(TRANSLATIONS['zh-TW']['home.tool.video.title']).toBe('AI 影片生成器');
    expect(TRANSLATIONS['zh-TW']['ppt_generator.settings.button.save']).toBe('儲存設定');
    expect(TRANSLATIONS['zh-TW']['profile.sessionsTitle']).toBe('登入裝置管理');
    expect(TRANSLATIONS['zh-CN']['language.switcher.title']).toBe('\u8bed\u8a00');
    expect(TRANSLATIONS['zh-HK']['language.switcher.title']).toBe('\u8a9e\u8a00');
    expect(TRANSLATIONS['zh-TW']['language.switcher.title']).toBe('語言');
  });

  it('keeps critical keys populated for every configured locale', () => {
    const criticalKeys = [
      'language.switcher.title',
      'nav.login',
      'footer.copyright',
      'ppt_generator.upload.banner.title',
      'ppt_generator.templates.controls.create',
    ] as const;

    for (const option of LOCALE_OPTIONS) {
      for (const key of criticalKeys) {
        expect(TRANSLATIONS[option.code][key]).toBeTruthy();
      }
    }
  });

  it('keeps english fallback values when zh-TW overrides are absent', () => {
    const partialZhTWMessages = extendMessages(enMessages, {
      'language.zhTW': '繁體中文（台灣）',
    });

    expect(partialZhTWMessages['language.zhTW']).toBe('繁體中文（台灣）');
    expect(partialZhTWMessages['ppt_generator.workflow.step.prepare']).toBe(
      enMessages['ppt_generator.workflow.step.prepare'],
    );
  });

  it('throws when duplicate translation keys are merged into the same section', () => {
    expect(() => mergeMessages({ 'shared.example': 'one' }, { 'shared.example': 'two' })).toThrow(
      'Duplicate translation key detected: shared.example',
    );
  });
});
