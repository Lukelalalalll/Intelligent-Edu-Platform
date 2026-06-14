import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    getMarkdownHighlighter,
    hasMarkdownCodeFence,
    loadMarkdownHighlighter,
    type MarkdownHighlighter,
} from './highlight';
import { hasMarkdownSyntax, renderMarkdownToHtml, renderPlainTextToHtml } from './renderMarkdown';

interface RenderedMarkdownProps {
    content: string;
    className?: string;
    isStreaming?: boolean;
    deferHighlightDuringStreaming?: boolean;
}

function getStreamRenderInterval(length: number): number {
    if (length < 500) return 80;
    if (length < 2000) return 150;
    return 300;
}

export default function RenderedMarkdown({
    content,
    className,
    isStreaming = false,
    deferHighlightDuringStreaming = false,
}: RenderedMarkdownProps) {
    const needsHighlight = hasMarkdownCodeFence(content);
    const shouldHighlight = needsHighlight && !(isStreaming && deferHighlightDuringStreaming);
    const [highlighter, setHighlighter] = useState<MarkdownHighlighter | null>(() => getMarkdownHighlighter());
    const [renderedHtml, setRenderedHtml] = useState<{ __html: string }>(
        () => {
            if (isStreaming) {
                return { __html: '' };
            }

            if (!hasMarkdownSyntax(content)) {
                return renderPlainTextToHtml(content);
            }

            return renderMarkdownToHtml(content, getMarkdownHighlighter());
        },
    );

    const latestContentRef = useRef(content);
    const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    latestContentRef.current = content;

    const updateRenderedHtml = useCallback((nextHtml: { __html: string }) => {
        setRenderedHtml((current) => (current.__html === nextHtml.__html ? current : nextHtml));
    }, []);

    const renderCurrentContent = useCallback((nextContent: string, nextHighlighter: MarkdownHighlighter | null) => {
        if (!nextContent) {
            return { __html: '' };
        }

        if (!hasMarkdownSyntax(nextContent)) {
            return renderPlainTextToHtml(nextContent);
        }

        return renderMarkdownToHtml(nextContent, nextHighlighter);
    }, []);

    useEffect(() => {
        if (!shouldHighlight || highlighter) {
            return undefined;
        }

        let cancelled = false;
        loadMarkdownHighlighter().then((loaded) => {
            if (!cancelled) {
                setHighlighter(loaded);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [shouldHighlight, highlighter]);

    useEffect(() => {
        if (!isStreaming) {
            if (renderTimerRef.current) {
                clearTimeout(renderTimerRef.current);
                renderTimerRef.current = null;
            }

            updateRenderedHtml(renderCurrentContent(content, shouldHighlight ? highlighter : null));
            return;
        }

        if (content.length === 0) {
            updateRenderedHtml({ __html: '' });
            return;
        }

        if (renderTimerRef.current !== null) {
            return;
        }

        renderTimerRef.current = setTimeout(() => {
            renderTimerRef.current = null;
            const current = latestContentRef.current;
            updateRenderedHtml(renderCurrentContent(current, shouldHighlight ? highlighter : null));
        }, getStreamRenderInterval(content.length));
    }, [content, highlighter, isStreaming, renderCurrentContent, shouldHighlight, updateRenderedHtml]);

    useEffect(() => () => {
        if (renderTimerRef.current) {
            clearTimeout(renderTimerRef.current);
        }
    }, []);

    return <div className={className} dangerouslySetInnerHTML={renderedHtml} />;
}
