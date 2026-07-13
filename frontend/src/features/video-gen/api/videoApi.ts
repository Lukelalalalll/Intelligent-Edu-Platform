import client from '@/shared/api/client';
import { resolveApiRoot } from '@/shared/api/root';
import type { GenerationHistoryItem } from '../../../types/api';
import type { Scene } from '../data/themes';

const apiRoot = resolveApiRoot();

export type VideoProjectStatus =
    | 'draft'
    | 'planning'
    | 'planned'
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed';

export type VideoShotStatus =
    | 'pending'
    | 'script_ready'
    | 'audio_ready'
    | 'rendering'
    | 'rendered'
    | 'muxed'
    | 'failed';

export interface VideoProviderConfig {
    lang: 'zh' | 'en';
    provider: 'local_ollama' | 'coze' | 'deepseek';
    audience: 'student' | 'teacher' | 'researcher' | 'general';
    subtitles: boolean;
    subtitle_mode: 'hard_srt' | 'image_strip' | 'none';
    brand_kit: 'none' | 'default';
    animation_level: 'off' | 'basic' | 'high';
    tts_engine: 'edge_tts' | 'cosyvoice';
    avatar_mode: 'none' | 'wav2lip' | 'latentsync';
    avatar_img_path: string;
    quiz_enabled: boolean;
    max_segments: number;
    broll_provider: 'comfyui' | 'local';
    comfyui_base_url?: string;
    comfyui_workflow_path?: string;
    default_negative_prompt?: string;
}

export interface VideoProjectSource {
    kind: 'text' | 'file';
    text: string;
    source_filename: string;
    file_type: string;
    uploaded_file_path: string;
}

export interface VideoStoryboard {
    scripts: string[];
    scene_count: number;
    shot_count: number;
    planned_at?: string;
}

export interface VideoShot {
    shot_id: string;
    scene_id: string;
    scene_order: number;
    shot_order: number;
    shot_type: string;
    duration_seconds: number;
    visual_prompt: string;
    negative_prompt: string;
    narration_text: string;
    status: VideoShotStatus;
    provider: string;
    audio_path: string;
    output_video_path: string;
    error: string;
    provider_request?: Record<string, unknown> | null;
    provider_response?: Record<string, unknown> | null;
}

export interface VideoProjectEvent {
    type: string;
    step: string;
    message: string;
    ts: string;
    progress?: number;
    payload?: Record<string, unknown>;
}

export interface VideoProjectArtifactItem {
    filename: string;
    public_path: string;
}

export interface VideoProjectArtifacts {
    storyboard?: VideoProjectArtifactItem;
    final_video?: VideoProjectArtifactItem;
    thumbnail?: VideoProjectArtifactItem;
    chapters?: VideoProjectArtifactItem;
    quiz?: VideoProjectArtifactItem;
}

export interface VideoProjectMetrics {
    scene_count: number;
    shot_count: number;
    status_counts: Record<string, number>;
    completed_shots: number;
    failed_shots: number;
}

export interface VideoProject {
    id: string;
    title: string;
    status: VideoProjectStatus;
    progress: number;
    current_step: string;
    latest_message: string;
    latest_error: string;
    source: VideoProjectSource;
    provider_config: VideoProviderConfig;
    storyboard: VideoStoryboard;
    scenes: Scene[];
    shots: VideoShot[];
    artifacts: VideoProjectArtifacts;
    metrics: VideoProjectMetrics;
    events: VideoProjectEvent[];
    created_at?: string;
    updated_at?: string;
    completed_at?: string;
}

export interface VideoProjectPage {
    items: VideoProject[];
    total: number;
    page: number;
    page_size: number;
}

export interface VideoProjectEventEnvelope {
    event: string;
    data: Record<string, unknown>;
}

export const defaultVideoProviderConfig: VideoProviderConfig = {
    lang: 'zh',
    provider: 'local_ollama',
    audience: 'student',
    subtitles: true,
    subtitle_mode: 'hard_srt',
    brand_kit: 'none',
    animation_level: 'basic',
    tts_engine: 'edge_tts',
    avatar_mode: 'none',
    avatar_img_path: '',
    quiz_enabled: false,
    max_segments: 8,
    broll_provider: 'comfyui',
    comfyui_base_url: 'http://127.0.0.1:8188',
}

function withProjectEnvelope<T extends { project: VideoProject }>(promise: Promise<{ data: T }>): Promise<VideoProject> {
    return promise.then((response) => response.data.project);
}

function resolveEventSourceUrl(path: string): string {
    return `${apiRoot}/api${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveVideoAssetUrl(assetPath?: string): string {
    const raw = String(assetPath || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${apiRoot}/${raw.replace(/^\/+/, '')}`;
}

export const videoApi = {
    optimizeScript: (
        inputData: { text?: string; file?: File; fileType?: string },
        lang = 'zh',
        provider = 'local_ollama',
        maxSegments = 8,
        audience = 'student',
    ) => {
        const fd = new FormData();
        if (inputData.text) fd.append('text', inputData.text);
        if (inputData.file) fd.append('file', inputData.file);
        fd.append('lang', lang);
        fd.append('provider', provider);
        fd.append('max_segments', String(maxSegments));
        fd.append('audience', audience);
        return client.post('/video/optimize-script', fd).then((r) => r.data);
    },

    optimizeScriptAsync: (
        inputData: { text?: string; file?: File; fileType?: string },
        lang = 'zh',
        provider = 'local_ollama',
        maxSegments = 8,
        audience = 'student',
    ) => {
        const fd = new FormData();
        if (inputData.text) fd.append('text', inputData.text);
        if (inputData.file) fd.append('file', inputData.file);
        fd.append('lang', lang);
        fd.append('provider', provider);
        fd.append('max_segments', String(maxSegments));
        fd.append('audience', audience);
        return client.post('/video/optimize-script-async', fd).then((r) => r.data);
    },

    generate: (
        inputData: { text?: string; file?: File },
        scenes: Scene[],
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
        quizEnabled = false,
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
        return client.post('/video/generate', fd).then((r) => r.data);
    },

    status: (taskId: string) => client.get(`/video/status/${taskId}`).then((r) => r.data),

    uploadSceneImage: (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return client.post('/video/upload-scene-image', fd).then((r) => r.data);
    },

    createProject: (payload: {
        title?: string;
        text?: string;
        file?: File | null;
        providerConfig?: Partial<VideoProviderConfig>;
    }) => {
        const fd = new FormData();
        if (payload.title) fd.append('title', payload.title);
        if (payload.text) fd.append('text', payload.text);
        if (payload.file) fd.append('file', payload.file);
        const config = { ...defaultVideoProviderConfig, ...(payload.providerConfig || {}) };
        Object.entries(config).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            fd.append(key, String(value));
        });
        return withProjectEnvelope(client.post('/video/projects', fd));
    },

    listProjects: (page = 1, pageSize = 20): Promise<VideoProjectPage> =>
        client
            .get('/video/projects', { params: { page, page_size: pageSize } })
            .then((r) => r.data),

    getProject: (projectId: string): Promise<VideoProject> =>
        withProjectEnvelope(client.get(`/video/projects/${projectId}`)),

    patchProject: (
        projectId: string,
        payload: {
            title?: string;
            scenes?: Scene[];
            provider_config?: Partial<VideoProviderConfig>;
        },
    ): Promise<VideoProject> => withProjectEnvelope(client.patch(`/video/projects/${projectId}`, payload)),

    updateProjectSource: (
        projectId: string,
        payload: {
            title?: string;
            text?: string;
            file?: File | null;
            sourceMode: 'text' | 'file';
        },
    ): Promise<VideoProject> => {
        const fd = new FormData();
        if (payload.title !== undefined) fd.append('title', payload.title);
        if (payload.text !== undefined) fd.append('text', payload.text);
        fd.append('source_mode', payload.sourceMode);
        if (payload.file) fd.append('file', payload.file);
        return withProjectEnvelope(client.post(`/video/projects/${projectId}/source`, fd));
    },

    planProject: (projectId: string): Promise<VideoProject> =>
        withProjectEnvelope(client.post(`/video/projects/${projectId}/plan`)),

    renderProject: (
        projectId: string,
        payload?: {
            title?: string;
            scenes?: Scene[];
            provider_config?: Partial<VideoProviderConfig>;
        },
    ): Promise<{ project: VideoProject; taskId: string; projectId: string }> =>
        client.post(`/video/projects/${projectId}/render`, payload || {}).then((r) => r.data),

    getProjectArtifacts: (projectId: string) =>
        client.get(`/video/projects/${projectId}/artifacts`).then((r) => r.data),

    projectStreamSSE: (
        projectId: string,
        onEvent: (envelope: VideoProjectEventEnvelope) => void,
        onError?: (error: string) => void,
    ): (() => void) => {
        if (typeof EventSource === 'undefined') {
            onError?.('EventSource is not supported in this browser.');
            return () => undefined;
        }

        const es = new EventSource(resolveEventSourceUrl(`/video/projects/${projectId}/stream`), {
            withCredentials: true,
        });

        const handleMessage = (eventName: string) => (evt: MessageEvent) => {
            try {
                onEvent({ event: eventName, data: JSON.parse(evt.data) as Record<string, unknown> });
            } catch {
                onEvent({ event: eventName, data: { raw: evt.data } });
            }
        };

        es.addEventListener('step_start', handleMessage('step_start'));
        es.addEventListener('step_progress', handleMessage('step_progress'));
        es.addEventListener('step_done', handleMessage('step_done'));
        es.addEventListener('step_error', handleMessage('step_error'));
        es.addEventListener('done', handleMessage('done'));
        es.onerror = () => {
            es.close();
            onError?.('Project stream disconnected.');
        };

        return () => es.close();
    },

    progressSSE: (
        taskId: string,
        onProgress: (progress: number, message: string) => void,
        onDone: (videoPath: string, warnings: Array<{ clip_index: number; reason: string }>, meta?: { quizPath?: string; chaptersPath?: string }) => void,
        onError: (error: string, details?: Array<{ clip_index: number; reason: string }>) => void,
    ): (() => void) => {
        if (typeof EventSource !== 'undefined') {
            const es = new EventSource(resolveEventSourceUrl(`/video/progress/${taskId}`), {
                withCredentials: true,
            });

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
                    retryCount += 1;
                    if (retryCount >= MAX_POLL_RETRIES) {
                        alive = false;
                        onError('Polling timed out after max retries. Check server status.');
                        return;
                    }
                }
                await new Promise((r) => setTimeout(r, 2500));
            }
        };
        poll();
        return () => {
            alive = false;
        };
    },
};

import { createHistoryApi } from '../../../api/historyApiFactory';

const _historyApi = createHistoryApi<GenerationHistoryItem>('/video');
export const { getGenerationHistory, getGenerationDetail } = _historyApi;
