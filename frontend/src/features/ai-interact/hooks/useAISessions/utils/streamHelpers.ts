import type React from 'react';
import type { RagCitation } from '@/types/api';

/** A UI element sent by the backend via SSE (tool calling result). */
export interface UIElement {
    type: 'image' | 'file' | 'choice' | 'diagram';
    url?: string;
    alt?: string;
    options?: string[];
    message?: string;
    file_name?: string;
}

/** Progress update for a tool call in-flight. */
export interface ToolProgress {
    name: string;
    status: 'running' | 'done' | 'error';
    message?: string;
    result?: unknown;
}

/** Callback to push a UI element into the message model. */
export type UIElementHandler = (element: UIElement) => void;

/** Callback to push a tool-progress event into the message model. */
export type ToolProgressHandler = (progress: ToolProgress) => void;

export function createRafBufferedUpdater(
    applySnapshot: (snapshot: string, citations?: RagCitation[], isCourseRelevant?: boolean, reasoning?: string) => void,
    rafRef: React.MutableRefObject<number | null>,
    onUIElement?: UIElementHandler,
    onToolProgress?: ToolProgressHandler,
) {
    let full = '';
    let reasoning = '';
    let citations: RagCitation[] | undefined;
    let isCourseRelevant = false;
    let providerNotice = '';

    const flush = () => {
        rafRef.current = null;
        const snapshot = providerNotice ? `${providerNotice}\n\n${full}` : full;
        applySnapshot(snapshot, citations, isCourseRelevant, reasoning || undefined);
    };

    const schedule = () => {
        if (rafRef.current == null) {
            rafRef.current = requestAnimationFrame(flush);
        }
    };

    const consumeSseObject = (obj: any) => {
        // ── DeepSeek structured think/answer frames ──
        if (obj.type === 'think' && obj.content !== undefined) {
            reasoning += obj.content;
            schedule();
            return;
        }
        if (obj.type === 'answer' && obj.content !== undefined) {
            full += obj.content;
            schedule();
            return;
        }

        // ── ui_element frames (tool calling results) ──
        if (obj.ui_element) {
            if (onUIElement) {
                onUIElement(obj.ui_element as UIElement);
            }
            // Also append a visible marker in the text stream so the user
            // knows something happened even if the rendering is not wired.
            const el = obj.ui_element as UIElement;
            let marker = '';
            if (el.type === 'image') {
                marker = `\n\n[Image: ${el.alt || el.url || 'generated'}]\n\n`;
            } else if (el.type === 'file') {
                marker = `\n\n[File: ${el.file_name || el.url || 'download'}]\n\n`;
            } else if (el.type === 'diagram') {
                marker = `\n\n[Diagram: ${el.alt || 'generated'}]\n\n`;
            } else if (el.type === 'choice') {
                marker = `\n\n> ${el.message || 'Please choose:'}\n> ${(el.options || []).map(o => `- ${o}`).join('\n> ')}\n\n`;
            }
            if (marker) {
                full += marker;
                schedule();
            }
            return;
        }

        // ── tool_progress frames ──
        if (obj.tool_progress) {
            if (onToolProgress) {
                onToolProgress(obj.tool_progress as ToolProgress);
            }
            const tp = obj.tool_progress as ToolProgress;
            if (tp.status === 'error') {
                full += `\n\n**[工具错误] ${tp.name}**: ${tp.message || 'unknown error'}\n\n`;
                schedule();
            }
            return;
        }

        if (obj.meta?.citations) {
            citations = obj.meta.citations;
        }
        if (obj.meta?.is_course_relevant !== undefined) {
            isCourseRelevant = Boolean(obj.meta.is_course_relevant);
        }
        if (obj.meta?.fallback_from && obj.meta?.fallback_to) {
            providerNotice = `Provider switched: ${obj.meta.fallback_from} -> ${obj.meta.fallback_to}`;
            schedule();
            return;
        }
        if (obj.meta?.warning && !providerNotice) {
            // Only show actionable provider warnings (e.g. model unavailable)
            const w = obj.meta.warning as string;
            if (!w.startsWith('no_rag') && !w.startsWith('insufficient')) {
                providerNotice = `Provider notice: ${w}`;
            }
            schedule();
            return;
        }
        if (obj.error) {
            full += `\n\n**[Error]**: ${obj.error}`;
            schedule();
            return;
        }
        if (obj.choices?.[0]?.delta?.content !== undefined) {
            full += obj.choices[0].delta.content;
            schedule();
        }
    };

    // Strip residual evidence/citation markers the LLM may have emitted,
    // e.g. "(Evidence 2)", "[Doc 1]", "[Web 3]", "[E1]"
    const stripCitationMarkers = (text: string) =>
        text.replace(/\s*[\(\[](?:Evidence|Doc|Web|E)\s*\d+[\)\]]/gi, '');

    const finalize = () => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        full = stripCitationMarkers(full);
        flush();
        const snapshot = providerNotice ? `${providerNotice}\n\n${full}` : full;
        return { snapshot, citations, isCourseRelevant, reasoning: reasoning || undefined };
    };

    return { consumeSseObject, finalize };
}
