// ── Single source of truth: shared with backend via data/slide_themes.json ──
import slideThemesJson from '../../../../../data/slide_themes.json';

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
  | 'two-column'
  | 'bar-chart'
  | 'flowchart'
  | 'code';

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
  { id: 'bar-chart',     label: 'Bar Chart',   icon: 'fa-chart-bar' },
  { id: 'flowchart',     label: 'Flowchart',   icon: 'fa-project-diagram' },
  { id: 'code',          label: 'Code',   icon: 'fa-code' },
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

export const THEMES: Record<ThemeId, ThemeDef> = Object.fromEntries(
  slideThemesJson.themes.map(t => [
    t.id,
    {
      bg: t.colors.bg,
      title: t.colors.title,
      body: t.colors.body,
      accent: t.colors.accent,
      label: t.label,
    }
  ])
) as Record<ThemeId, ThemeDef>;

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
  /** bar-chart layout fields */
  chartData?: Array<{ label: string; value: number }>;
  /** flowchart layout fields */
  flowSteps?: string[];
  /** code layout fields */
  codeSnippet?: string;
  codeLanguage?: string;
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
