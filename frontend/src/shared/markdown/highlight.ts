export type MarkdownHighlighter = typeof import('highlight.js/lib/core').default;

let highlighterPromise: Promise<MarkdownHighlighter> | null = null;
let highlighterInstance: MarkdownHighlighter | null = null;

function registerLanguages(highlighter: MarkdownHighlighter, languages: Array<[string, unknown]>) {
    if ((highlighter as MarkdownHighlighter & { __eduRegistered?: boolean }).__eduRegistered) {
        return;
    }

    for (const [name, language] of languages) {
        highlighter.registerLanguage(name, language as Parameters<MarkdownHighlighter['registerLanguage']>[1]);
    }

    (highlighter as MarkdownHighlighter & { __eduRegistered?: boolean }).__eduRegistered = true;
}

export function hasMarkdownCodeFence(content: string): boolean {
    return /```[\s\S]*?```/.test(content);
}

export function getMarkdownHighlighter(): MarkdownHighlighter | null {
    return highlighterInstance;
}

export async function loadMarkdownHighlighter(): Promise<MarkdownHighlighter> {
    if (highlighterInstance) {
        return highlighterInstance;
    }

    if (!highlighterPromise) {
        highlighterPromise = Promise.all([
            import('highlight.js/lib/core'),
            import('highlight.js/lib/languages/bash'),
            import('highlight.js/lib/languages/css'),
            import('highlight.js/lib/languages/javascript'),
            import('highlight.js/lib/languages/json'),
            import('highlight.js/lib/languages/markdown'),
            import('highlight.js/lib/languages/python'),
            import('highlight.js/lib/languages/typescript'),
            import('highlight.js/lib/languages/xml'),
        ]).then(([
            { default: highlighter },
            { default: bash },
            { default: css },
            { default: javascript },
            { default: json },
            { default: markdown },
            { default: python },
            { default: typescript },
            { default: xml },
        ]) => {
            registerLanguages(highlighter, [
                ['bash', bash],
                ['sh', bash],
                ['shell', bash],
                ['css', css],
                ['javascript', javascript],
                ['js', javascript],
                ['json', json],
                ['markdown', markdown],
                ['md', markdown],
                ['python', python],
                ['py', python],
                ['typescript', typescript],
                ['ts', typescript],
                ['html', xml],
                ['xml', xml],
            ]);

            highlighterInstance = highlighter;
            return highlighter;
        });
    }

    return highlighterPromise;
}
