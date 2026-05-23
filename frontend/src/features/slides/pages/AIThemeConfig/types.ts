export type BaseTheme = 'minimalist' | 'neon_tech' | 'corporate';

export interface GenerateRenderPayload {
  md_content: string;
  base_style: BaseTheme;
  custom_style_prompt: string;
  provider: 'local_ollama' | 'coze' | 'deepseek';
}

export interface GenerateRenderResponse {
  status: string;
  pptx_download_url: string;
  html_preview_url: string;
  page_count: number;
  custom_css?: string;
  request_id?: string;
}

export interface ThemeOption {
  value: BaseTheme;
  label: string;
  description: string;
  icon: string;
  previewClass: string;
}

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