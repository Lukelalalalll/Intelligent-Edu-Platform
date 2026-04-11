/**
 * videoApi — Video generation REST API client + history.
 * Combines videoApi (from api.ts) and videoHistoryApi.ts.
 */
import client from '../../../api/client';
import type { GenerationHistoryItem } from '../../../types/api';

export const videoApi = {
    optimizeScript: (inputData: { text?: string; file?: File; fileType?: string }, lang = 'zh', provider = 'local_ollama', maxSegments = 8, audience = 'student') => {
        const fd = new FormData();
        if (inputData.text) fd.append('text', inputData.text);
        if (inputData.file) fd.append('file', inputData.file);
        fd.append('lang', lang);
        fd.append('provider', provider);
        fd.append('max_segments', String(maxSegments));
        fd.append('audience', audience);
        return client.post('/video/optimize-script', fd).then(r => r.data);
    },

    generate: (
        inputData: { text?: string; file?: File },
        scenes: Array<{
            id: string; script: string; slideMode: string; themeId: string;
            slideTitle: string; slideBody: string; customImagePath?: string;
            layoutType?: string; layoutImagePath?: string; toneMode?: string;
            quoteText?: string; col1Title?: string; col1Bullets?: string[];
            col2Title?: string; col2Bullets?: string[];
        }>,
        lang = 'zh',
        provider = 'local_ollama',
        subtitles = true,
        maxSegments = 8,
        audience = 'student',
    ) => {
        const fd = new FormData();
        if (inputData.text) fd.append('text', inputData.text);
        if (inputData.file) fd.append('file', inputData.file);
        fd.append('scenes', JSON.stringify(scenes));
        fd.append('lang', lang);
        fd.append('provider', provider);
        fd.append('subtitles', String(subtitles));
        fd.append('max_segments', String(maxSegments));
        fd.append('audience', audience);
        return client.post('/video/generate', fd).then(r => r.data);
    },

    uploadSceneImage: (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return client.post('/video/upload-scene-image', fd).then(r => r.data);
    },

    optimizeScriptAsync: (inputData: { text?: string; file?: File; fileType?: string }, lang = 'zh', provider = 'local_ollama', maxSegments = 8, audience = 'student') => {
        const fd = new FormData();
        if (inputData.text) fd.append('text', inputData.text);
        if (inputData.file) fd.append('file', inputData.file);
        fd.append('lang', lang);
        fd.append('provider', provider);
        fd.append('max_segments', String(maxSegments));
        fd.append('audience', audience);
        return client.post('/video/optimize-script-async', fd).then(r => r.data);
    },

    status: (taskId: string) => client.get(`/video/status/${taskId}`).then(r => r.data),
};

// ── History (factory-based) ──

import { createHistoryApi } from '../../../api/historyApiFactory';

const _historyApi = createHistoryApi<GenerationHistoryItem>('/video');
export const { getGenerationHistory, getGenerationDetail } = _historyApi;
