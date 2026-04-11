export type ThemeId =
  | 'dark-ocean'
  | 'forest'
  | 'midnight'
  | 'sunset'
  | 'minimal-white'
  | 'corp-blue'
  | 'chalkboard'
  | 'tech-noir'
  | 'rose-gold'
  | 'lunar';

export type LayoutType =
  | 'title-bullets'
  | 'image-left'
  | 'image-right'
  | 'image-top'
  | 'big-quote'
  | 'two-column';

export type ToneMode = 'lecture' | 'inspire' | 'poetry';

export interface LayoutOption {
  id: LayoutType;
  label: string;
  icon: string;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: 'title-bullets', label: '标准',   icon: 'fa-list' },
  { id: 'image-left',    label: '左图',   icon: 'fa-columns' },
  { id: 'image-right',   label: '右图',   icon: 'fa-columns fa-flip-horizontal' },
  { id: 'image-top',     label: '顶图',   icon: 'fa-window-maximize' },
  { id: 'big-quote',     label: '引用',   icon: 'fa-quote-left' },
  { id: 'two-column',    label: '双栏',   icon: 'fa-th-large' },
];

export const TONE_OPTIONS: { id: ToneMode; label: string; desc: string }[] = [
  { id: 'lecture', label: '讲课', desc: '稍慢、带停顿，适合知识讲授' },
  { id: 'inspire', label: '激励', desc: '稍快、带强调，适合总结结论' },
  { id: 'poetry',  label: '朗读', desc: '低沉、平缓，适合文学诗歌' },
];

export interface ThemeDef {
  bg: string;
  title: string;
  body: string;
  accent: string;
  label: string;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  'dark-ocean':    { bg: '#0f2744', title: '#60a5fa', body: '#e2e8f0', accent: '#1e40af', label: '深海蓝' },
  'forest':        { bg: '#0d2b1e', title: '#4ade80', body: '#d1fae5', accent: '#166534', label: '森林绿' },
  'midnight':      { bg: '#1a0533', title: '#c084fc', body: '#f3e8ff', accent: '#7c3aed', label: '午夜紫' },
  'sunset':        { bg: '#4a1515', title: '#fb923c', body: '#fde8d8', accent: '#c2410c', label: '日落橙' },
  'minimal-white': { bg: '#ffffff', title: '#1e293b', body: '#475569', accent: '#e2e8f0', label: '极简白' },
  'corp-blue':     { bg: '#1e3a5f', title: '#ffffff', body: '#bfdbfe', accent: '#1d4ed8', label: '商务蓝' },
  'chalkboard':    { bg: '#1a3028', title: '#fef08a', body: '#f0fdf4', accent: '#15803d', label: '黑板绿' },
  'tech-noir':     { bg: '#111827', title: '#22d3ee', body: '#94a3b8', accent: '#0e7490', label: '科技黑' },
  'rose-gold':     { bg: '#3d1525', title: '#fda4af', body: '#fce7f3', accent: '#be185d', label: '玫瑰金' },
  'lunar':         { bg: '#1c1c2e', title: '#e2e8f0', body: '#94a3b8', accent: '#334155', label: '月球灰' },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export interface Scene {
  id: string;
  script: string;
  slideMode: 'theme' | 'image';
  themeId: ThemeId;
  slideTitle: string;
  slideBody: string;
  customImagePath?: string;
  /** local preview only — not sent to backend */
  _imagePreviewUrl?: string;

  /* ── V2 fields ── */
  layoutType: LayoutType;
  /** Image embedded inside the layout (not just background) */
  layoutImagePath?: string;
  _layoutImagePreviewUrl?: string;
  toneMode: ToneMode;
  /** big-quote layout: the quote text */
  quoteText?: string;
  /** two-column layout fields */
  col1Title?: string;
  col1Bullets?: string[];
  col2Title?: string;
  col2Bullets?: string[];
}

export function createScene(script: string = '', idx: number = 0): Scene {
  return {
    id: crypto.randomUUID(),
    script,
    slideMode: 'theme',
    themeId: 'dark-ocean',
    slideTitle: `第 ${idx + 1} 节`,
    slideBody: '',
    layoutType: 'title-bullets',
    toneMode: 'lecture',
  };
}
