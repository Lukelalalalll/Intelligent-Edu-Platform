import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

import styles from '../styles/questionStudio.module.css';

export default function QuestionMarkdown({ markdown }: { markdown: string }) {
    return (
        <div className={styles.markdownPreview}>
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {markdown}
            </ReactMarkdown>
        </div>
    );
}
