/**
 * videoApi — Video generation REST API client + history.
 * Combines videoApi (from api.ts) and videoHistoryApi.ts.
 */
import client from '@/shared/api/client';
import type { GenerationHistoryItem } from '../../../types/api';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

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
        subtitleMode: 'hard_srt' | 'image_strip' | 'none' = 'hard_srt',
        brandKit: 'none' | 'default' = 'none',
        animationLevel: 'off' | 'basic' | 'high' = 'basic',
        ttsEngine: 'edge_tts' | 'cosyvoice' = 'edge_tts',
        avatarMode: 'none' | 'wav2lip' | 'latentsync' = 'none',
        quizEnabled: boolean = false,
        avatarImagePath?: string,
    ) => {
        const fd = new FormData();
        if (inputData.text) fd.append('text', inputData.text);
        if (inputData.file) fd.append('file', inputData.file);
        fd.append('scenes', JSON.stringify(scenes));
        fd.append('lang', lang);
        fd.append('provider', provider);
        fd.append('subtitles', String(subtitles));
        fd.append('subtitle_mode', subtitleMode);
        fd.append('max_segments', String(maxSegments));
        fd.append('audience', audience);
        fd.append('brand_kit', brandKit);
        fd.append('animation_level', animationLevel);
        fd.append('tts_engine', ttsEngine);
        fd.append('avatar_mode', avatarMode);
        fd.append('quiz_enabled', String(quizEnabled));
        if (avatarImagePath) fd.append('avatar_img_path', avatarImagePath);
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

    /**
     * Subscribe to SSE progress stream for a video task.
     * Falls back to polling automatically if EventSource is unavailable.
     *
     * @returns cleanup function — call it to close the connection / stop polling
     */
    progressSSE: (
        taskId: string,
        onProgress: (progress: number, message: string) => void,
        onDone: (videoPath: string, warnings: Array<{ clip_index: number; reason: string }>, meta?: { quizPath?: string; chaptersPath?: string }) => void,
        onError: (error: string, details?: Array<{ clip_index: number; reason: string }>) => void,
    ): (() => void) => {
        // ── SSE path ──
        if (typeof EventSource !== 'undefined') {
            const url = `${apiRoot}/api/video/progress/${taskId}`;
            const es = new EventSource(url);

            es.onmessage = (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    const type: string = data.type ?? 'progress';

                    if (type === 'done' || type === 'warn') {
                        es.close();
                        onDone(data.videoPath ?? '', data.errors ?? [], { quizPath: data.quizPath, chaptersPath: data.chaptersPath });
                    } else if (type === 'error') {
                        es.close();
                        onError(data.error ?? 'Unknown error', data.errors);
                    } else {
                        onProgress(data.progress ?? 0, data.message ?? '');
                    }
                } catch {
                    // ignore malformed event
                }
            };

            es.onerror = () => {
                es.close();
                onError('Connection to progress stream lost. Check server logs.');
            };

            return () => es.close();
        }

        // ── Polling fallback ──
        const MAX_POLL_RETRIES = 120;
        let alive = true;
        let retryCount = 0;
        const poll = async () => {
            while (alive) {
                try {
                    const task = await videoApi.status(taskId);
                    onProgress(task.progress ?? 0, task.message ?? '');
                    if (task.status === 'done') {
                        alive = false;
                        onDone(task.videoPath ?? '', task.errors ?? [], { quizPath: task.quizPath, chaptersPath: task.chaptersPath });
                        return;
                    }
                    if (task.status === 'error') {
                        alive = false;
                        onError(task.error ?? 'Unknown error', task.errors);
                        return;
                    }
                } catch {
                    retryCount++;
                    if (retryCount >= MAX_POLL_RETRIES) {
                        alive = false;
                        onError('Polling timed out after max retries. Check server status.');
                        return;
                    }
                }
                await new Promise(r => setTimeout(r, 2500));
            }
        };
        poll();
        return () => { alive = false; };
    },
};

// ── History (factory-based) ──

import { createHistoryApi } from '../../../api/historyApiFactory';

const _historyApi = createHistoryApi<GenerationHistoryItem>('/video');
export const { getGenerationHistory, getGenerationDetail } = _historyApi;

