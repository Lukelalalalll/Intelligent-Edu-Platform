import { useCallback, useEffect, useMemo, useState } from 'react';
import { aiConfigApi, type AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';
import { slidesGenerationApi, type SlidesProviderStatus } from '../../../api/slidesApi';
import type {
  BaseTheme,
  ExportRenderDraftResponse,
  GenerateRenderResponse,
  RenderDraftPreviewResponse,
  ThemeDraftLayout,
  ThemeDraftSlide,
  ThemeDraftStage,
} from '../types';

export type ThemeConfigProviderOption = {
  id: 'openai' | 'deepseek' | 'bigmodel' | 'local_ollama' | 'coze' | 'auto';
  label: string;
  disabled: boolean;
  reason?: string;
  configured: boolean;
  available: boolean;
  source?: string;
  model?: string;
};

const DEFAULT_TITLE = 'Presentation';
export const THEME_DRAFT_STORAGE_KEY = 'slides_md_draft_content';
export const THEME_DRAFT_TITLE_KEY = 'slides_md_draft_title';

function readStoredDraft() {
  if (typeof window === 'undefined') {
    return { content: null as string | null, title: '' };
  }
  return {
    content: window.localStorage.getItem(THEME_DRAFT_STORAGE_KEY),
    title: window.localStorage.getItem(THEME_DRAFT_TITLE_KEY) || '',
  };
}

function writeStoredDraft(content: string, title: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_DRAFT_STORAGE_KEY, content);
  window.localStorage.setItem(THEME_DRAFT_TITLE_KEY, title);
}

function buildProviderOptions(
  providers: SlidesProviderStatus[],
  aiConfig: AIConfigResponse | null,
): ThemeConfigProviderOption[] {
  const providerMap = new Map(providers.map((item) => [item.id, item]));
  const options: ThemeConfigProviderOption[] = [];

  const openaiConfigured = Boolean(aiConfig?.openai?.api_key_set);
  const deepseekConfigured = Boolean(aiConfig?.deepseek?.api_key_set);
  const bigmodelConfigured = Boolean(aiConfig?.bigmodel?.api_key_set);

  const orderedIds: Array<'openai' | 'deepseek' | 'bigmodel' | 'local_ollama' | 'coze' | 'auto'> = [
    'openai',
    'deepseek',
    'bigmodel',
    'local_ollama',
    'coze',
    'auto',
  ];

  for (const id of orderedIds) {
    const status = providerMap.get(id);
    if (!status) continue;

    if (id === 'openai') {
      options.push({
        id,
        label: 'OpenAI',
        disabled: !openaiConfigured,
        reason: openaiConfigured ? undefined : 'Configure OpenAI in AI Config first',
        configured: openaiConfigured,
        available: status.available,
        source: status.source,
        model: aiConfig?.openai?.model || status.model,
      });
      continue;
    }

    if (id === 'deepseek') {
      options.push({
        id,
        label: 'DeepSeek',
        disabled: !deepseekConfigured,
        reason: deepseekConfigured ? undefined : 'Configure DeepSeek in AI Config first',
        configured: deepseekConfigured,
        available: status.available,
        source: status.source,
        model: aiConfig?.deepseek?.model || status.model,
      });
      continue;
    }

    if (id === 'bigmodel') {
      const status = providerMap.get(id);
      options.push({
        id,
        label: 'BigModel / GLM',
        disabled: !bigmodelConfigured,
        reason: bigmodelConfigured ? undefined : 'Configure BigModel / GLM in AI Config first',
        configured: bigmodelConfigured,
        available: status?.available ?? bigmodelConfigured,
        source: status?.source ?? 'user_ai_config',
        model: aiConfig?.text?.bigmodel?.model || aiConfig?.bigmodel?.text_model || status?.model,
      });
      continue;
    }

    options.push({
      id,
      label: status.label,
      disabled: false,
      configured: status.configured,
      available: status.available,
      source: status.source,
      model: status.model,
      reason: status.available ? undefined : status.message,
    });
  }

  return options;
}

function normalizeDraftSlides(slides: ThemeDraftSlide[]): ThemeDraftSlide[] {
  return slides.map((slide, index) => ({
    id: slide.id || `slide-${index + 1}`,
    heading: slide.heading || (index === 0 ? 'Presentation Title' : `Slide ${index + 1}`),
    body: slide.body || '',
    bullets: Array.isArray(slide.bullets) ? slide.bullets : [],
    accent_text: slide.accent_text || '',
    layout: slide.layout || (index === 0 ? 'cover' : 'content'),
    align: slide.align || 'left',
  }));
}

type ApiErrorData = {
  detail?: string | {
    message?: string;
    details?: string;
    error_code?: string;
    renderer?: {
      available: boolean;
      mode: 'browser' | 'unavailable';
      message?: string;
    };
  };
  message?: string;
};

function getApiErrorMessage(error: unknown, fallbackPrefix: string): string {
  const e = error as { response?: { data?: ApiErrorData }; message?: string };
  const detail = e.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === 'object') {
    const structured = [detail.details, detail.renderer?.message, detail.message].find(
      (value) => typeof value === 'string' && value.trim(),
    );
    if (structured) {
      return structured;
    }
  }
  if (e.response?.data?.message) {
    return e.response.data.message;
  }
  return `${fallbackPrefix}: ${e.message ?? ''}`.trim();
}

export function useThemeConfig() {
  const [baseTheme, setBaseTheme] = useState<BaseTheme>('neon_tech');
  const [userCustomThemePrompt, setUserCustomThemePrompt] = useState('');
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [markdownDraft, setMarkdownDraft] = useState<string | null>(null);
  const [workflowStage, setWorkflowStage] = useState<ThemeDraftStage>('configure');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<GenerateRenderResponse | null>(null);
  const [exportResult, setExportResult] = useState<ExportRenderDraftResponse | null>(null);
  const [draftSlides, setDraftSlides] = useState<ThemeDraftSlide[]>([]);
  const [customCss, setCustomCss] = useState('');
  const [previewResult, setPreviewResult] = useState<RenderDraftPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);
  const [providers, setProviders] = useState<SlidesProviderStatus[]>([]);
  const [providerLoading, setProviderLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'deepseek' | 'bigmodel' | 'local_ollama' | 'coze' | 'auto'>('auto');

  useEffect(() => {
    const stored = readStoredDraft();
    if (stored.title) {
      setTitle(stored.title);
    }
    if (stored.content !== null) {
      setMarkdownDraft(stored.content);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setProviderLoading(true);
    Promise.all([
      aiConfigApi.get(),
      slidesGenerationApi.listProviders(),
    ])
      .then(([config, providerRes]) => {
        if (!alive) return;
        setAiConfig(config);
        setProviders(providerRes.providers);
        const options = buildProviderOptions(providerRes.providers, config);
        const preferred = options.find((item) => !item.disabled && (item.id === 'openai' || item.id === 'deepseek' || item.id === 'bigmodel'));
        setSelectedProvider(preferred?.id || options.find((item) => !item.disabled)?.id || 'auto');
      })
      .catch(() => {
        if (!alive) return;
        setErrorMsg('Failed to load AI configuration. Please refresh and try again.');
      })
      .finally(() => {
        if (!alive) return;
        setProviderLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    if (workflowStage === 'generating') {
      setGenerationProgress(8);
      timer = window.setInterval(() => {
        setGenerationProgress((prev) => (prev < 88 ? prev + Math.random() * 9 : prev));
      }, 700);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [workflowStage]);

  useEffect(() => {
    let timer: number | undefined;
    if (workflowStage === 'exporting') {
      setExportProgress(10);
      timer = window.setInterval(() => {
        setExportProgress((prev) => (prev < 90 ? prev + Math.random() * 11 : prev));
      }, 650);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [workflowStage]);

  const providerOptions = useMemo(
    () => buildProviderOptions(providers, aiConfig),
    [providers, aiConfig],
  );

  const selectedProviderMeta = useMemo(
    () => providerOptions.find((item) => item.id === selectedProvider) || null,
    [providerOptions, selectedProvider],
  );

  const updateSlide = useCallback((slideId: string, patch: Partial<ThemeDraftSlide>) => {
    setDraftSlides((prev) => prev.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide)));
  }, []);

  const updateBullets = useCallback((slideId: string, bulletsText: string) => {
    const bullets = bulletsText
      .split('\n')
      .map((item) => item.replace(/^[-*+]\s*/, '').trim())
      .filter(Boolean);
    updateSlide(slideId, { bullets });
  }, [updateSlide]);

  const setSlideLayout = useCallback((slideId: string, layout: ThemeDraftLayout) => {
    updateSlide(slideId, { layout });
  }, [updateSlide]);

  const commitMarkdownDraft = useCallback((content: string, draftTitle: string) => {
    const nextTitle = draftTitle.trim() || DEFAULT_TITLE;
    setMarkdownDraft(content);
    setTitle(nextTitle);
    writeStoredDraft(content, nextTitle);
  }, []);

  const replaceSourceDraft = useCallback((content: string, draftTitle: string) => {
    commitMarkdownDraft(content, draftTitle);
    setErrorMsg('');
    setResult(null);
    setExportResult(null);
    setDraftSlides([]);
    setCustomCss('');
    setPreviewResult(null);
    setPreviewLoading(false);
    setWorkflowStage('configure');
    setGenerationProgress(0);
    setExportProgress(0);
  }, [commitMarkdownDraft]);

  const generate = useCallback(async (content: string, titleOverride?: string, sourceMeta?: {
    sourceKind?: 'upload' | 'text';
    sourceFilename?: string;
    sourceDisplayName?: string;
    combinedMarkdownFilename?: string;
  }) => {
    if (!content.trim()) {
      setErrorMsg('No content to generate slides from. Please go back and upload a document first.');
      return;
    }
    setErrorMsg('');
    setResult(null);
    setExportResult(null);
    setPreviewResult(null);
    setWorkflowStage('generating');
    setGenerationProgress(12);
    try {
      const filename = localStorage.getItem('combinedFilename') || '';
      const resolvedTitle = titleOverride?.trim() || title.trim() || filename.replace(/\.[^.]+$/, '') || DEFAULT_TITLE;
      const response = await slidesGenerationApi.generateRender({
        md_content: content,
        base_style: baseTheme,
        custom_style_prompt: userCustomThemePrompt,
        provider: selectedProvider,
        title: resolvedTitle,
        source_kind: sourceMeta?.sourceKind,
        source_filename: sourceMeta?.sourceFilename,
        source_display_name: sourceMeta?.sourceDisplayName,
        combined_markdown_filename: sourceMeta?.combinedMarkdownFilename,
      });
      const normalizedSlides = normalizeDraftSlides(response.draft_slides || []);
      setTitle(response.title || resolvedTitle);
      setDraftSlides(normalizedSlides);
      setCustomCss(response.custom_css || '');
      setResult(response);
      setWorkflowStage('editing');
      setGenerationProgress(100);
    } catch (error: unknown) {
      setErrorMsg(getApiErrorMessage(error, 'Generation failed'));
      setWorkflowStage('markdown');
    }
  }, [baseTheme, selectedProvider, title, userCustomThemePrompt]);

  const exportDraft = useCallback(async () => {
    if (!draftSlides.length || !customCss) return;
    setErrorMsg('');
    setWorkflowStage('exporting');
    setExportResult(null);
    try {
      const response = await slidesGenerationApi.exportRenderDraft({
        title: title.trim() || DEFAULT_TITLE,
        css_content: customCss,
        slides: draftSlides,
      });
      setExportResult(response);
      setWorkflowStage('complete');
      setExportProgress(100);
    } catch (error: unknown) {
      setErrorMsg(getApiErrorMessage(error, 'Export failed'));
      setWorkflowStage('editing');
    }
  }, [customCss, draftSlides, title]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    if (workflowStage !== 'editing' && workflowStage !== 'exporting') {
      setPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (!draftSlides.length || !customCss) {
      setPreviewResult(null);
      setPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setPreviewLoading(true);
    timer = window.setTimeout(() => {
      slidesGenerationApi.renderDraftPreview({
        title: title.trim() || DEFAULT_TITLE,
        css_content: customCss,
        slides: draftSlides,
      })
        .then((response) => {
          if (cancelled) return;
          setPreviewResult(response);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setPreviewResult(null);
          setErrorMsg((current) => (current ? current : getApiErrorMessage(error, 'Preview failed')));
        })
        .finally(() => {
          if (cancelled) return;
          setPreviewLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [customCss, draftSlides, title, workflowStage]);

  const resetToConfigure = useCallback(() => {
    setWorkflowStage('configure');
  }, []);

  const openMarkdownDraft = useCallback(() => {
    setWorkflowStage('markdown');
  }, []);

  const editMarkdownDraft = useCallback((content: string) => {
    setMarkdownDraft(content);
    writeStoredDraft(content, title);
  }, [title]);

  const returnToEditing = useCallback(() => {
    if (!draftSlides.length) return;
    setWorkflowStage('editing');
  }, []);

  return {
    baseTheme,
    setBaseTheme,
    userCustomThemePrompt,
    setUserCustomThemePrompt,
    title,
    setTitle,
    workflowStage,
    markdownDraft,
    generationProgress,
    exportProgress,
    errorMsg,
    result,
    exportResult,
    draftSlides,
    customCss,
    previewResult,
    previewLoading,
    providerLoading,
    providerOptions,
    selectedProvider,
    setSelectedProvider,
    selectedProviderMeta,
    generate,
    openMarkdownDraft,
    editMarkdownDraft,
    commitMarkdownDraft,
    replaceSourceDraft,
    exportDraft,
    resetToConfigure,
    returnToEditing,
    updateSlide,
    updateBullets,
    setSlideLayout,
    setErrorMsg,
  };
}
