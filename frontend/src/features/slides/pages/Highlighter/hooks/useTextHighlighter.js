import { useCallback } from 'react';
import { log } from '../../../../../utils/logger';

export default function useTextHighlighter({
    isRenderedView,
    markdownViewRef,
    currentSectionTitle,
    onHighlightCreated
}) {
    const handleMouseUp = useCallback(() => {
        if (!isRenderedView) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        const range = selection.getRangeAt(0);
        if (!markdownViewRef || !markdownViewRef.current) return;
        const container = markdownViewRef.current;
        if (!container.contains(range.commonAncestorContainer)) return;

        // 检查是否与已有高亮重叠
        const existingSpans = container.querySelectorAll('.highlighted');
        for (let i = 0; i < existingSpans.length; i++) {
            if (range.intersectsNode(existingSpans[i])) {
                selection.removeAllRanges();
                return;
            }
        }

        const highlightId = 'hl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        try {
            const spanTemplate = document.createElement('span');
            spanTemplate.className = 'highlighted';
            spanTemplate.dataset.id = highlightId;

            if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
                range.surroundContents(spanTemplate);
            } else {
                const fragment = range.extractContents();
                const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null);
                const textNodes = [];
                let node;
                while ((node = walker.nextNode())) {
                    if (node.nodeValue.trim().length > 0) textNodes.push(node);
                }
                textNodes.forEach(textNode => {
                    const span = spanTemplate.cloneNode();
                    if (textNode.parentNode) {
                        textNode.parentNode.insertBefore(span, textNode);
                        span.appendChild(textNode);
                    }
                });
                range.insertNode(fragment);
            }
            selection.removeAllRanges();

            // 通知 Entry 更新 state
            if (typeof onHighlightCreated === 'function') {
                onHighlightCreated({ id: highlightId, text: selectedText, sectionTitle: currentSectionTitle });
            }
        } catch (e) {
            log.error('highlighter', 'Highlighting error', { message: e?.message });
            selection.removeAllRanges();
        }
    }, [isRenderedView, markdownViewRef, currentSectionTitle, onHighlightCreated]);

    return handleMouseUp;
}
