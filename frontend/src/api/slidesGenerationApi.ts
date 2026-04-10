import client from './client';

export type SlidesGenerateV2Payload = {
    provider?: 'coze' | 'local_ollama';
    content?: string;
    chapterData?: Array<{ sectionTitle?: string; text?: string }>;
    total_pages: number;
    num_of_bullets: number;
    words_each_bullet: number;
    presentation_title?: string;
    script_style?: string;
    generate_talking_script?: boolean;
    generate_word_document?: boolean;
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
        provider: 'coze' | 'local_ollama';
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

export const slidesGenerationApi = {
    async createTask(payload: SlidesGenerateV2Payload): Promise<SlidesGenerateV2TaskCreateResponse> {
        const res = await client.post('/slides/generate_v2', payload);
        return res.data;
    },

    async getTask(taskId: string): Promise<SlidesGenerateV2TaskStatusResponse> {
        const res = await client.get(`/slides/tasks/${taskId}`);
        return res.data;
    },

    async checkProviderHealth(provider?: 'coze' | 'local_ollama') {
        const res = await client.get('/slides/provider-health', {
            params: provider ? { provider } : undefined,
        });
        return res.data;
    },
};
