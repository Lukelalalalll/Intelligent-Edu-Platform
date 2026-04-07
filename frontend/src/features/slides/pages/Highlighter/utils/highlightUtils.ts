import { log } from '../../../../../utils/logger';

/**
 * Converts plain text to a regex fragment that matches both raw characters
 * and their HTML entity equivalents (e.g. "&" matches "&amp;").
 */
export function textToHtmlRegex(text: string): string {
    const entityMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const specialChars = /[&<>"']/g;
    let result = '';
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = specialChars.exec(text)) !== null) {
        if (m.index > lastIndex) {
            result += text.slice(lastIndex, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        const char = m[0];
        const entity = entityMap[char];
        result += `(?:${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
        lastIndex = m.index + 1;
    }
    if (lastIndex < text.length) {
        result += text.slice(lastIndex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return result;
}

/**
 * Injects highlight spans into an HTML string by matching plain text with a
 * regex that tolerates HTML entity variants. Only matches text outside tags.
 */
export function injectHighlightsIntoHtml(html: string, sectionHighlights: Array<{ id: string; text: string }>): string {
    if (!html || !sectionHighlights || sectionHighlights.length === 0) return html;

    let result = html;
    const sorted = [...sectionHighlights].sort((a, b) => b.text.length - a.text.length);

    for (const h of sorted) {
        if (!h.text || h.text.trim().length === 0) continue;
        try {
            const pattern = textToHtmlRegex(h.text);
            const regex = new RegExp(`(?<=>|^)([^<]*?)(${pattern})`, 'g');
            let replaced = false;
            result = result.replace(regex, (match, before, target) => {
                if (replaced) return match;
                replaced = true;
                return `${before}<span class="highlighted" data-id="${h.id}">${target}</span>`;
            });
        } catch (e) {
            log.warn('highlighter', 'Highlight injection regex failed', { id: h.id, error: (e as Error)?.message });
        }
    }
    return result;
}
