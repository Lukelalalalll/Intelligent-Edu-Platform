export type BaseTheme = 'minimalist' | 'neon_tech' | 'corporate';

export type ThemeDraftLayout = 'cover' | 'content' | 'split' | 'quote';
export type ThemeDraftAlign = 'left' | 'center';

export type ThemeDraftSlide = {
  id: string;
  heading: string;
  body: string;
  bullets: string[];
  accent_text: string;
  layout: ThemeDraftLayout;
  align: ThemeDraftAlign;
};

export type RendererStatus = {
  available: boolean;
  mode: 'browser' | 'unavailable';
  message?: string;
};

export interface GenerateRenderPayload {
  md_content: string;
  base_style: BaseTheme;
  custom_style_prompt: string;
  provider: 'auto' | 'local_ollama' | 'coze' | 'deepseek' | 'openai';
  title?: string;
}

export interface GenerateRenderResponse {
  status: string;
  pptx_download_url: string;
  html_preview_url: string;
  page_count: number;
  draft_slides: ThemeDraftSlide[];
  custom_css?: string;
  request_id?: string;
  render_mode?: 'screenshot_pptx';
  warning?: string;
  title?: string;
  provider_requested?: string;
  provider_resolved?: string | null;
  provider_source?: string | null;
  provider_model?: string | null;
  renderer?: RendererStatus;
  error_code?: string;
  details?: string;
}

export interface ExportRenderDraftPayload {
  title: string;
  css_content: string;
  slides: ThemeDraftSlide[];
}

export interface ExportRenderDraftResponse {
  status: string;
  pptx_download_url: string;
  html_preview_url: string;
  page_count: number;
  render_mode?: 'screenshot_pptx';
  warning?: string;
  title?: string;
  renderer?: RendererStatus;
  error_code?: string;
  details?: string;
}

export interface RenderDraftPreviewPayload {
  title: string;
  css_content: string;
  slides: ThemeDraftSlide[];
  selected_slide_id?: string;
  selected_index?: number;
}

export interface RenderDraftPreviewResponse {
  status: string;
  html: string;
  page_count: number;
  selected_index: number;
  selected_slide_id: string;
  renderer?: RendererStatus;
}

export interface ThemeOption {
  value: BaseTheme;
  label: string;
  description: string;
  icon: string;
  previewClass: string;
}

export type ThemeDraftStage = 'configure' | 'generating' | 'markdown' | 'editing' | 'exporting' | 'complete';

export const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'minimalist',
    label: 'Minimalist Academic',
    description: 'Clean white background, serif fonts, muted green accents — perfect for academic presentations',
    icon: 'fa-graduation-cap',
    previewClass: 'theme-preview-minimalist',
  },
  {
    value: 'neon_tech',
    label: 'Neon Tech',
    description: 'Dark cyberpunk aesthetic, neon green accents, glow animations — great for tech talks & keynotes',
    icon: 'fa-microchip',
    previewClass: 'theme-preview-neon',
  },
  {
    value: 'corporate',
    label: 'Corporate',
    description: 'Professional blue gradients, sans-serif fonts, clean borders — ideal for business meetings',
    icon: 'fa-building',
    previewClass: 'theme-preview-corporate',
  },
];
