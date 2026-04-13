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
  { id: 'title-bullets', label: 'Standard',   icon: 'fa-list' },
  { id: 'image-left',    label: 'Image Left',   icon: 'fa-columns' },
  { id: 'image-right',   label: 'Image Right',   icon: 'fa-columns fa-flip-horizontal' },
  { id: 'image-top',     label: 'Image Top',   icon: 'fa-window-maximize' },
  { id: 'big-quote',     label: 'Quote',   icon: 'fa-quote-left' },
  { id: 'two-column',    label: 'Two Columns',   icon: 'fa-th-large' },
];

export const TONE_OPTIONS: { id: ToneMode; label: string; desc: string }[] = [
  { id: 'lecture', label: 'Lecture', desc: 'Slightly slower with pauses, ideal for concept teaching' },
  { id: 'inspire', label: 'Inspiring', desc: 'Slightly faster with emphasis, ideal for key takeaways' },
  { id: 'poetry',  label: 'Recitation', desc: 'Calm and deep tone, ideal for literature and poetry' },
];

export interface ThemeDef {
  bg: string;
  title: string;
  body: string;
  accent: string;
  label: string;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  'dark-ocean':    { bg: '#0f2744', title: '#60a5fa', body: '#e2e8f0', accent: '#1e40af', label: 'Deep Ocean Blue' },
  'forest':        { bg: '#0d2b1e', title: '#4ade80', body: '#d1fae5', accent: '#166534', label: 'Forest Green' },
  'midnight':      { bg: '#1a0533', title: '#c084fc', body: '#f3e8ff', accent: '#7c3aed', label: 'Midnight Purple' },
  'sunset':        { bg: '#4a1515', title: '#fb923c', body: '#fde8d8', accent: '#c2410c', label: 'Sunset Orange' },
  'minimal-white': { bg: '#ffffff', title: '#1e293b', body: '#475569', accent: '#e2e8f0', label: 'Minimal White' },
  'corp-blue':     { bg: '#1e3a5f', title: '#ffffff', body: '#bfdbfe', accent: '#1d4ed8', label: 'Corporate Blue' },
  'chalkboard':    { bg: '#1a3028', title: '#fef08a', body: '#f0fdf4', accent: '#15803d', label: 'Chalkboard Green' },
  'tech-noir':     { bg: '#111827', title: '#22d3ee', body: '#94a3b8', accent: '#0e7490', label: 'Tech Noir' },
  'rose-gold':     { bg: '#3d1525', title: '#fda4af', body: '#fce7f3', accent: '#be185d', label: 'Rose Gold' },
  'lunar':         { bg: '#1c1c2e', title: '#e2e8f0', body: '#94a3b8', accent: '#334155', label: 'Lunar Gray' },
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
    slideTitle: `Section ${idx + 1}`,
    slideBody: '',
    layoutType: 'title-bullets',
    toneMode: 'lecture',
  };
}
