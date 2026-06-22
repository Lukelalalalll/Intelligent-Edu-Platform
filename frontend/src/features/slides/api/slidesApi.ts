/**
 * slidesApi — unified Slides (Sub1) API client.
 * Merges slidesDeliveryApi, slidesGenerationApi, and slidesHistoryApi.
 */
import client from '@/shared/api/client';
import type { AIProvider } from '../../../shared/aiProvider';
import type { GenerationHistoryItem } from '../../../types/api';
import type {
    ExportRenderDraftPayload,
    ExportRenderDraftResponse,
    GenerateRenderPayload,
    GenerateRenderResponse,
    RenderDraftPreviewPayload,
    RenderDraftPreviewResponse,
} from '../pages/AIThemeConfig/types';

// ── Delivery Types ──

export type DeliveryArtifactType = 'agenda' | 'speaker_notes' | 'in_class_questions' | 'homework_suggestions';

export interface SlidesDeliveryPayload {
    provider?: AIProvider;
    title: string;
    ppt_schema: Record<string, unknown>;
    script_style?: string;
    locale?: string;
}

export interface SlidesDeliveryPreview {
    agenda_count: number;
    speaker_notes_count: number;
    in_class_questions_count: number;
    homework_count: number;
}

export interface SlidesDeliveryJobResponse {
    success: boolean;
    job_id: string;
    status: string;
    slides_count: number;
    artifacts_preview: SlidesDeliveryPreview;
}

export interface SlidesDeliveryJob {
    job_id: string;
    title: string;
    status: string;
    locale: string;
    script_style: string;
    slides_count: number;
    created_at?: string;
    updated_at?: string;
}

export interface SlidesArtifactResponse<T = unknown> {
    success: boolean;
    job_id: string;
    artifact_type: DeliveryArtifactType;
    data: T;
}

// ── Generation Types ──

export type SlidesRuntimeProvider = 'auto' | 'coze' | 'local_ollama' | 'deepseek' | 'openai';

export interface SlidesProviderStatus {
    id: SlidesRuntimeProvider;
    label: string;
    available: boolean;
    configured: boolean;
    source: string;
    model: string;
    message: string;
    is_recommended: boolean;
}

export interface SvgDeckSlide {
    index: number;
    title: string;
    rhythm: string;
    svg_url: string;
    preview_url: string;
    quality_status: string;
    filename: string;
}

export interface SlidesQualityIssue {
    slide_index: number;
    severity: 'error' | 'warning';
    message: string;
}

export interface SlidesQualityReport {
    status: 'passed' | 'failed';
    total_slides: number;
    issues: SlidesQualityIssue[];
}

export interface SvgDeckManifest {
    deck_id: string;
    title: string;
    slides: SvgDeckSlide[];
    quality_report: SlidesQualityReport;
    design_spec_url: string;
    spec_lock: Record<string, unknown>;
    exports: SlidesExports;
}

export interface SlidesPptxExport {
    available: boolean;
    kind: string;
    source: string;
    filename: string;
    download_url: string;
}

export interface SlidesExports {
    pptx?: SlidesPptxExport;
    [key: string]: unknown;
}

export interface SlidesThemeItem {
    name: string;
    description?: string;
    base_theme?: string;
    preview_theme?: string;
    source?: string;
    source_group?: string;
    layout_count?: number;
}

export interface PresentonOutlineSlide {
    id?: string;
    index: number;
    title?: string;
    objective?: string;
    key_points?: string[];
    content: string;
}

export interface PresentonOutlineRequestPayload {
    provider?: SlidesRuntimeProvider;
    content?: string;
    chapterData?: Array<{ sectionTitle?: string; text?: string }>;
    total_pages: number;
    presentation_title?: string;
    source_kind?: 'upload' | 'text';
    source_filename?: string;
    source_display_name?: string;
    combined_markdown_filename?: string;
}

export interface PresentonOutlineResponse {
    success: boolean;
    request_id: string;
    title: string;
    provider_requested?: SlidesRuntimeProvider;
    provider_resolved?: Exclude<SlidesRuntimeProvider, 'auto'>;
    provider_source?: string;
    provider_model?: string;
    slides: PresentonOutlineSlide[];
}

export type SlidesGenerateV2Payload = {
    provider?: SlidesRuntimeProvider;
    content?: string;
    chapterData?: Array<{ sectionTitle?: string; text?: string }>;
    outlineSlides?: Array<Record<string, unknown>>;
    theme?: string;
    total_pages: number;
    num_of_bullets: number;
    words_each_bullet: number;
    presentation_title?: string;
    script_style?: string;
    generate_talking_script?: boolean;
    generate_word_document?: boolean;
    source_kind?: 'upload' | 'text';
    source_filename?: string;
    source_display_name?: string;
    combined_markdown_filename?: string;
};

export type SlidesGenerateV2TaskCreateResponse = {
    success: boolean;
    task_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    request_id: string;
};

export type SlidesGenerateV2TaskStatusResponse = {
    success: boolean;
    task_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    current_step: string;
    progress: number;
    request_id: string;
    result?: {
        status: 'success';
        results: Array<{
            slide_number: number;
            title: string;
            content: string[];
            latex?: string[];
            chart_type?: string;
            chart_reasoning?: string[];
        }>;
        ppt_schema: {
            presentation_title: string;
            slides: Array<Record<string, unknown>>;
            metadata?: Record<string, unknown>;
        };
        provider: Exclude<SlidesRuntimeProvider, 'auto'>;
        provider_requested?: SlidesRuntimeProvider;
        provider_resolved?: Exclude<SlidesRuntimeProvider, 'auto'>;
        provider_source?: string;
        provider_model?: string;
        fallback_events?: Array<Record<string, unknown>>;
        deck_id?: string;
        outline_slides?: PresentonOutlineSlide[];
        design_spec_url?: string;
        spec_lock?: Record<string, unknown>;
        quality_report?: SlidesQualityReport;
        slides?: SvgDeckSlide[];
        exports?: SlidesExports;
        theme?: string;
        total_scripts?: number;
        estimated_total_duration?: string;
        word_document?: {
            available: boolean;
            filename: string;
            download_url: string;
        };
    };
    error?: string;
    events?: Array<{
        type: string;
        step: string;
        message: string;
        ts: number;
        payload?: Record<string, unknown>;
    }>;
};

// ── Delivery API ──

export const slidesDeliveryApi = {
    createJob: async (payload: SlidesDeliveryPayload): Promise<SlidesDeliveryJobResponse> => {
        const res = await client.post('/slides/delivery/jobs', payload);
        return res.data;
    },
    getJob: async (jobId: string): Promise<{ success: boolean; job: SlidesDeliveryJob }> => {
        const res = await client.get(`/slides/delivery/jobs/${jobId}`);
        return res.data;
    },
    getArtifact: async <T = unknown>(jobId: string, artifactType: DeliveryArtifactType): Promise<SlidesArtifactResponse<T>> => {
        const res = await client.get(`/slides/delivery/jobs/${jobId}/artifact/${artifactType}`);
        return res.data;
    },
};

// ── Generation API ──

export const slidesGenerationApi = {
    async createTask(payload: SlidesGenerateV2Payload): Promise<SlidesGenerateV2TaskCreateResponse> {
        const res = await client.post('/slides/generate_v2', payload);
        return res.data;
    },
    async generatePresentonOutline(payload: PresentonOutlineRequestPayload): Promise<PresentonOutlineResponse> {
        const res = await client.post('/slides/presenton/outline', payload);
        return res.data;
    },
    async getTask(taskId: string): Promise<SlidesGenerateV2TaskStatusResponse> {
        const res = await client.get(`/slides/tasks/${taskId}`);
        return res.data;
    },
    async checkProviderHealth(provider?: SlidesRuntimeProvider) {
        const res = await client.get('/slides/provider-health', {
            params: provider ? { provider } : undefined,
        });
        return res.data;
    },
    async listProviders(): Promise<{ providers: SlidesProviderStatus[] }> {
        const res = await client.get('/slides/providers');
        return res.data;
    },
    async getThemes(): Promise<SlidesThemeItem[]> {
        const res = await client.get('/slides/get_themes');
        return Array.isArray(res.data) ? res.data : [];
    },
    async downloadMarkdown(filename: string): Promise<string> {
        const res = await client.get(`/slides/download/${filename}`);
        return typeof res.data === 'string' ? res.data : res.data?.content || '';
    },
    async downloadSourceText(filename: string): Promise<string> {
        const res = await client.get(`/slides/download_source/${filename}`);
        return typeof res.data === 'string' ? res.data : res.data?.content || '';
    },
    async getDeck(deckId: string): Promise<SvgDeckManifest> {
        const res = await client.get(`/slides/decks/${deckId}`);
        return res.data;
    },
    async getDesignSpec(deckId: string): Promise<string> {
        const res = await client.get(`/slides/decks/${deckId}/design-spec`, { responseType: 'text' });
        return res.data;
    },
    async generateRender(payload: GenerateRenderPayload): Promise<GenerateRenderResponse> {
        const res = await client.post('/slides/generate-render', payload);
        return res.data;
    },
    async exportRenderDraft(payload: ExportRenderDraftPayload): Promise<ExportRenderDraftResponse> {
        const res = await client.post('/slides/export-render-draft', payload);
        return res.data;
    },
    async renderDraftPreview(payload: RenderDraftPreviewPayload): Promise<RenderDraftPreviewResponse> {
        const res = await client.post('/slides/render-draft-preview', payload);
        return res.data;
    },
};

// ── History API (factory-based) ──

import { createHistoryApi } from '../../../api/historyApiFactory';

const _historyApi = createHistoryApi<GenerationHistoryItem>('/slides');
export const { getGenerationHistory, getGenerationDetail, replayGeneration } = _historyApi;

// ── Editor Types ──

export interface EditorBbox {
    x: number; y: number; w: number; h: number;
}

export interface EditorElement {
    id: string;
    type: 'text' | 'image';
    placeholder_idx: number;
    bbox: EditorBbox;
    content: string | null;
    font_size?: number | null;
    bold?: boolean;
    font_color?: string | null;
    align?: string;
    editable: boolean;
}

export interface EditorSlide {
    index: number;
    preview_url: string;
    elements: EditorElement[];
}

export interface EditorSession {
    session_id: string;
    theme: string;
    slide_width_pt: number;
    slide_height_pt: number;
    slides: EditorSlide[];
}

export interface EditorEdit {
    slide_index: number;
    element_id: string;
    content?: string;
    image_asset_id?: string;
}

export interface SlideImage {
    slide_index: number;
    asset_id: string;
    ext: string;
    x_pct?: number;
    y_pct?: number;
    w_pct?: number;
}

// ── Editor API ──

export const slidesEditorApi = {
    async autoAssignLayouts(payload: {
        provider?: AIProvider;
        theme: string;
        ppt_schema: Record<string, unknown>;
    }): Promise<{ ppt_schema: Record<string, unknown> }> {
        const res = await client.post('/slides/editor/auto-assign-layouts', payload);
        return res.data;
    },

    async renderEditorSession(payload: {
        theme: string;
        ppt_schema: Record<string, unknown>;
    }): Promise<EditorSession> {
        const res = await client.post('/slides/editor/render-editor-session', payload);
        return res.data;
    },

    async reRenderSession(payload: {
        session_id: string;
        edits: EditorEdit[];
        slide_images?: SlideImage[];
    }): Promise<EditorSession> {
        const res = await client.post('/slides/editor/re-render-session', payload);
        return res.data;
    },

    async exportPptx(payload: {
        session_id: string;
        theme: string;
        ppt_schema: Record<string, unknown>;
        edits?: EditorEdit[];
        slide_images?: SlideImage[];
    }): Promise<Blob> {
        const res = await client.post('/slides/editor/export-pptx', payload, { responseType: 'blob' });
        return res.data;
    },

    async uploadImage(file: File): Promise<{ asset_id: string; url: string }> {
        const form = new FormData();
        form.append('file', file);
        const res = await client.post('/slides/editor/upload-image', form);
        return res.data;
    },
};
