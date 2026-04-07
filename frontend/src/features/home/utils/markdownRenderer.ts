import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

const renderer = new marked.Renderer();
renderer.code = function (token) {
    const codeText = typeof token === 'object' ? token.text : token;
    const langText = typeof token === 'object' ? token.lang : arguments[1];
    const safeCode = codeText || '';
    const validLang = langText && hljs.getLanguage(langText) ? langText : 'plaintext';
    let highlighted = '';
    try {
        highlighted = validLang === 'plaintext'
            ? hljs.highlightAuto(safeCode).value
            : hljs.highlight(safeCode, { language: validLang }).value;
    } catch (e) {
        console.warn('Code highlight fallback triggered', e);
        highlighted = safeCode;
    }
    return `
        <div class="code-block-wrapper">
            <div class="code-block-header">
                <div class="code-header-left">
                    <div class="code-block-mac-dots"><span></span><span></span><span></span></div>
                    <span class="code-lang-text">${validLang}</span>
                </div>
                <button class="code-copy-btn js-code-copy-btn" data-code="${encodeURIComponent(safeCode)}">
                    <i class="far fa-copy"></i> Copy code
                </button>
            </div>
            <pre><code class="hljs language-${validLang}">${highlighted}</code></pre>
        </div>
    `;
};
marked.setOptions({ breaks: true, renderer });

export function renderMarkdown(content: string): { __html: string } {
    if (!content) return { __html: '' };
    try {
        const rawHtml = typeof marked.parse === 'function'
            ? marked.parse(content) as string
            : marked(content) as string;
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ADD_ATTR: ['class', 'data-code'],
            ADD_TAGS: ['button', 'i', 'span'],
        });
        return { __html: cleanHtml };
    } catch (err) {
        console.error('Markdown render error', err);
        return { __html: `<p style="color:red">Render Error: ${content}</p>` };
    }
}
