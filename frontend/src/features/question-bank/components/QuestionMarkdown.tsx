import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

import styles from '../styles/questionStudio.module.css';

function normalizeLatexDelimiters(markdown: string): string {
    return String(markdown || '')
        .replace(/\\\[/g, () => '$$')
        .replace(/\\\]/g, () => '$$')
        .replace(/\\\(/g, () => '$')
        .replace(/\\\)/g, () => '$');
}

export default function QuestionMarkdown({ markdown }: { markdown: string }) {
    const normalizedMarkdown = normalizeLatexDelimiters(markdown);

    return (
        <div className={styles.markdownPreview}>
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {normalizedMarkdown}
            </ReactMarkdown>
        </div>
    );
}
