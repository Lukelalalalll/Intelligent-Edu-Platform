import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import client, { resolveApiRoot } from '@/shared/api/client';
import type { AIProvider } from '@/shared/aiProvider';
import styles from '../styles/diagram.module.css';

type DiagramService = 'extract' | 'images' | 'search' | 'generate';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type ProviderStatus = {
    id: AIProvider;
    label: string;
    available: boolean;
    configured: boolean;
    source: string;
    model: string;
    message: string;
    is_recommended?: boolean;
};

type ToolProgress = {
    name: string;
    status: 'running' | 'done' | 'complete' | 'error';
    message?: string;
};

type DiagramCopilotPanelProps = {
    provider: AIProvider;
    onProviderChange: (provider: AIProvider) => void;
    activeService: DiagramService;
    onActiveServiceChange: (service: DiagramService) => void;
    workspaceState: Record<string, unknown>;
    onUiElement: (element: any) => void;
};

const QUICK_PROMPTS = [
    '帮我生成一个细胞呼吸流程图',
    '搜索一个神经网络结构 SVG，并把英文标签改成中文',
    '根据当前 SVG 重新排版成课堂讲解风格',
    '生成 4 张教学配图并打包导出',
];

const SERVICE_LABELS: Record<DiagramService, string> = {
    extract: 'Extract',
    images: 'Images',
    search: 'Search',
    generate: 'Generate',
};

const TOOL_LABELS: Record<string, string> = {
    diagram_assistant: 'Task Planner',
    diagram_generate_svg: 'Generate SVG',
    diagram_expand_brief: 'Expand Brief',
    diagram_extract_document: 'Extract Summary',
    diagram_search_svg: 'Search SVG',
    diagram_edit_svg_text: 'Edit SVG Text',
    diagram_refine_svg: 'Refine SVG',
    diagram_generate_images: 'Generate Images',
    diagram_export_assets: 'Export Assets',
    diagram_replay_history: 'Replay History',
};

const readCookie = (name: string): string => {
    if (typeof document === 'undefined') return '';
    const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
};

const compactStatus = (status: string) => {
    if (status === 'complete') return 'done';
    return status;
};

export default function DiagramCopilotPanel({
    provider,
    onProviderChange,
    activeService,
    onActiveServiceChange,
    workspaceState,
    onUiElement,
}: DiagramCopilotPanelProps) {
    const [providers, setProviders] = useState<ProviderStatus[]>([]);
    const [providerLoading, setProviderLoading] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: '你好，我可以直接调用图解生成、SVG 搜索编辑、PDF 提取总结和教学配图工具。' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState<ToolProgress[]>([]);
    const [uiElements, setUiElements] = useState<any[]>([]);
    const [runtimeMeta, setRuntimeMeta] = useState<any>(null);
    const abortRef = useRef<AbortController | null>(null);
    const logRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        setProviderLoading(true);
        client.get('/diagram/providers')
            .then((res) => {
                if (!cancelled) {
                    setProviders(Array.isArray(res.data?.providers) ? res.data.providers : []);
                }
            })
            .catch(() => {
                if (!cancelled) setProviders([]);
            })
            .finally(() => {
                if (!cancelled) setProviderLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, progress, uiElements]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const providerById = useMemo(() => {
        const map = new Map<string, ProviderStatus>();
        providers.forEach((item) => map.set(item.id, item));
        return map;
    }, [providers]);

    const providerUnavailable = providers.length > 0 && !providers.some((item) => item.available);
    const selectedProvider = providerById.get(provider);

    const appendAssistant = useCallback((delta: string) => {
        if (!delta) return;
        setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: `${last.content}${delta}` };
                return next;
            }
            return [...next, { role: 'assistant', content: delta }];
        });
    }, []);

    const handleProgress = useCallback((nextProgress: ToolProgress) => {
        setProgress((prev) => {
            const existingIndex = prev.findIndex((item) => item.name === nextProgress.name);
            if (existingIndex >= 0) {
                const next = [...prev];
                next[existingIndex] = nextProgress;
                return next;
            }
            return [...prev, nextProgress].slice(-6);
        });
    }, []);

    const handleUiElement = useCallback((element: any) => {
        setUiElements((prev) => [element, ...prev].slice(0, 6));
        onUiElement(element);
    }, [onUiElement]);

    const consumeSseObject = useCallback((obj: any) => {
        if (obj.meta) {
            setRuntimeMeta(obj.meta);
            return;
        }
        if (obj.tool_progress) {
            handleProgress(obj.tool_progress);
            return;
        }
        if (obj.ui_element) {
            handleUiElement(obj.ui_element);
            return;
        }
        if (obj.error) {
            const message = String(obj.error);
            setError(message);
            appendAssistant(`\n\n${message}`);
            return;
        }
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta !== undefined) {
            appendAssistant(String(delta));
        }
    }, [appendAssistant, handleProgress, handleUiElement]);

    const sendMessage = useCallback(async (overrideText?: string) => {
        const content = String(overrideText ?? input).trim();
        if (!content || loading) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setInput('');
        setError('');
        setProgress([]);
        setRuntimeMeta(null);
        setLoading(true);

        const outgoingMessages: ChatMessage[] = [...messages, { role: 'user', content }];
        setMessages([...outgoingMessages, { role: 'assistant', content: '' }]);

        try {
            const csrfToken = readCookie('csrf_token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

            const response = await fetch(`${resolveApiRoot()}/api/diagram/assistant/stream`, {
                method: 'POST',
                headers,
                credentials: 'include',
                signal: controller.signal,
                body: JSON.stringify({
                    messages: outgoingMessages,
                    provider: provider || 'auto',
                    active_service: activeService,
                    workspace_state: workspaceState || {},
                }),
            });

            if (!response.ok) {
                throw new Error(`Assistant request failed (${response.status})`);
            }
            if (!response.body) {
                throw new Error('Assistant stream is empty');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const dataStr = trimmed.replace(/^data:\s*/, '');
                    if (!dataStr || dataStr === '[DONE]') continue;
                    try {
                        consumeSseObject(JSON.parse(dataStr));
                    } catch (err) {
                        if (import.meta.env.DEV) {
                            console.debug('diagram assistant sse parse failed', err);
                        }
                    }
                }
            }
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                const message = err?.message || 'Diagram assistant failed';
                setError(message);
                appendAssistant(`\n\n${message}`);
            }
        } finally {
            setLoading(false);
        }
    }, [activeService, appendAssistant, consumeSseObject, input, loading, messages, provider, workspaceState]);

    const renderResultCard = (element: any, index: number) => {
        const type = String(element?.type || '');
        const target = element?.target_tab as DiagramService | undefined;
        const title = ({
            diagram_svg: 'SVG 图解',
            svg_search_results: 'SVG 候选',
            edited_svg: 'SVG 预览',
            ai_images: '教学配图',
            expanded_brief: '扩写简报',
            extracted_summary: '提取总结',
            export_assets: '导出动作',
            history_replay: '历史回放',
        } as Record<string, string>)[type] || '结果';
        const detail = (() => {
            if (type === 'svg_search_results') return `${element.results?.length || 0} 个候选`;
            if (type === 'ai_images') return `${element.images?.length || 0} 张图片`;
            if (type === 'edited_svg') return element.mode === 'refine' ? '已重绘' : `${element.count || 0} 处替换`;
            if (type === 'diagram_svg') return element.meta?.provider ? `${element.meta.provider} · ${element.meta.model || ''}` : '已生成';
            if (type === 'expanded_brief') return '已放入生成区';
            return element.summary || element.message || '已同步到工作台';
        })();

        return (
            <button
                key={`${type}-${index}`}
                type="button"
                className={styles.copilotResultCard}
                onClick={() => target && onActiveServiceChange(target)}
            >
                <span>{title}</span>
                <small>{detail}</small>
            </button>
        );
    };

    return (
        <aside className={styles.copilotPanel}>
            <div className={styles.copilotHeader}>
                <div>
                    <div className={styles.copilotEyebrow}>AI 图解工作台</div>
                    <h3>Diagram Copilot</h3>
                </div>
                <select
                    value={provider || 'auto'}
                    onChange={(e) => onProviderChange(e.target.value as AIProvider)}
                    className={styles.copilotProviderSelect}
                    title={selectedProvider?.message || 'Provider'}
                >
                    {providers.length === 0 && <option value={provider || 'auto'}>{providerLoading ? 'Loading...' : 'Auto'}</option>}
                    {providers.map((item) => (
                        <option key={item.id} value={item.id} disabled={item.id !== 'auto' && !item.available}>
                            {item.label}{item.is_recommended ? ' · 推荐' : ''}
                        </option>
                    ))}
                </select>
            </div>

            {providerUnavailable && (
                <div className={styles.copilotProviderWarning}>
                    <span>当前没有可用模型。</span>
                    <a href="/ai-config">配置 AI</a>
                </div>
            )}

            {runtimeMeta && (
                <div className={styles.copilotRuntime}>
                    <span>{runtimeMeta.provider_id || runtimeMeta.provider}</span>
                    <small>{runtimeMeta.provider_source || runtimeMeta.config_source} · {runtimeMeta.model}</small>
                </div>
            )}

            <div className={styles.copilotServiceTabs}>
                {(Object.keys(SERVICE_LABELS) as DiagramService[]).map((service) => (
                    <button
                        key={service}
                        type="button"
                        className={activeService === service ? styles.copilotServiceActive : undefined}
                        onClick={() => onActiveServiceChange(service)}
                    >
                        {SERVICE_LABELS[service]}
                    </button>
                ))}
            </div>

            <div className={styles.copilotQuickPrompts}>
                {QUICK_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => sendMessage(prompt)} disabled={loading}>
                        {prompt}
                    </button>
                ))}
            </div>

            <div className={styles.copilotLog} ref={logRef}>
                {messages.map((message, index) => (
                    <div
                        key={`${message.role}-${index}`}
                        className={`${styles.copilotMessage} ${message.role === 'user' ? styles.copilotMessageUser : styles.copilotMessageAssistant}`}
                    >
                        {message.content || (loading && index === messages.length - 1 ? '...' : '')}
                    </div>
                ))}

                {progress.length > 0 && (
                    <div className={styles.copilotProgressList}>
                        {progress.map((item) => (
                            <div key={item.name} className={`${styles.copilotProgressItem} ${styles[`copilotProgress_${compactStatus(item.status)}`] || ''}`}>
                                <span>{TOOL_LABELS[item.name] || item.name}</span>
                                <small>{item.message || item.status}</small>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {uiElements.length > 0 && (
                <div className={styles.copilotResults}>
                    {uiElements.map(renderResultCard)}
                </div>
            )}

            {error && <div className={styles.copilotError}>{error}</div>}

            <div className={styles.copilotComposer}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                    placeholder="输入图解任务..."
                    rows={3}
                />
                <button type="button" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
                    {loading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
                </button>
            </div>
        </aside>
    );
}
