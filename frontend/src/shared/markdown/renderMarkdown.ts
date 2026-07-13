import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { MarkdownHighlighter } from './highlight';

const RENDER_CACHE_MAX = 150;
const renderCache = new Map<string, { __html: string }>();

export function hasMarkdownSyntax(content: string): boolean {
    return /```|`|\*\*|__|^\s{0,3}#{1,6}\s|^\s{0,3}(?:[-*+]|\d+\.)\s|^\s{0,3}>\s|!\[[^\]]*]\(|\[[^\]]+]\(|<\w+[\s>]/m.test(content);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderPlainTextToHtml(content: string): { __html: string } {
    if (!content) {
        return { __html: '' };
    }

    return {
        __html: escapeHtml(content).replace(/\n/g, '<br/>'),
    };
}

function highlightCode(
    codeText: string,
    langText: string | undefined,
    highlighter: MarkdownHighlighter | null,
): { code: string; language: string } {
    const safeCode = codeText || '';
    const requestedLanguage = langText?.toLowerCase().trim();

    if (!highlighter) {
        return {
            code: escapeHtml(safeCode),
            language: requestedLanguage || 'plaintext',
        };
    }

    const validLanguage = requestedLanguage && highlighter.getLanguage(requestedLanguage)
        ? requestedLanguage
        : null;

    try {
        if (validLanguage) {
            return {
                code: highlighter.highlight(safeCode, { language: validLanguage }).value,
                language: validLanguage,
            };
        }

        return {
            code: highlighter.highlightAuto(safeCode).value,
            language: requestedLanguage || 'plaintext',
        };
    } catch {
        return {
            code: escapeHtml(safeCode),
            language: requestedLanguage || 'plaintext',
        };
    }
}

function createRenderer(highlighter: MarkdownHighlighter | null) {
    const renderer = new marked.Renderer();

    renderer.code = function (token) {
        const codeText = typeof token === 'object' ? token.text : String(token);
        const langText = typeof token === 'object' ? token.lang : undefined;
        const safeCode = codeText || '';
        const highlighted = highlightCode(safeCode, langText, highlighter);

        return `
            <div class="code-block-wrapper">
                <div class="code-block-header">
                    <div class="code-header-left">
                        <div class="code-block-mac-dots"><span></span><span></span><span></span></div>
                        <span class="code-lang-text">${highlighted.language}</span>
                    </div>
                    <button class="code-copy-btn js-code-copy-btn" data-code="${encodeURIComponent(safeCode)}">
                        <i class="far fa-copy"></i> Copy code
                    </button>
                </div>
                <pre><code class="hljs language-${highlighted.language}">${highlighted.code}</code></pre>
            </div>
        `;
    };

    return renderer;
}

export function renderMarkdownToHtml(
    content: string,
    highlighter: MarkdownHighlighter | null,
): { __html: string } {
    if (!content) {
        return { __html: '' };
    }

    const cacheKey = `${highlighter ? 'highlighted' : 'plain'}:${content.length}:${content}`;
    const cacheHit = renderCache.get(cacheKey);
    if (cacheHit) {
        return cacheHit;
    }

    try {
        const rawHtml = marked.parse(content, {
            breaks: true,
            renderer: createRenderer(highlighter),
        }) as string;
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ADD_ATTR: ['class', 'data-code'],
            ADD_TAGS: ['button', 'i', 'span'],
        });
        const result = { __html: cleanHtml };

        if (renderCache.size >= RENDER_CACHE_MAX) {
            renderCache.delete(renderCache.keys().next().value!);
        }
        renderCache.set(cacheKey, result);
        return result;
    } catch {
        return { __html: `<p style="color:red">Render Error: ${escapeHtml(content)}</p>` };
    }
}
