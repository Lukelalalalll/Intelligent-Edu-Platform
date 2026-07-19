import React from 'react';
import katexCssText from 'katex/dist/katex.min.css?inline';

import QuestionMarkdown from './components/QuestionMarkdown';

export interface QuestionPdfExportMeta {
    title?: string;
    subtitle?: string;
}

const PRINT_CSS = `
  body {
    margin: 0;
    padding: 32px;
    color: #172033;
    font: 16px/1.65 Inter, Arial, sans-serif;
    background: #fff;
  }
  .question-print-shell {
    max-width: 860px;
    margin: 0 auto;
  }
  .question-print-header {
    margin-bottom: 24px;
  }
  .question-print-header h1 {
    margin: 0 0 8px;
    font-size: 28px;
  }
  .question-print-header p {
    margin: 0;
    color: #536072;
  }
  .question-print-section {
    border-top: 1px solid #d7deea;
    padding-top: 20px;
    margin-top: 20px;
  }
  .question-print-markdown {
    overflow-x: auto;
  }
  .question-print-markdown .markdownPreview {
    max-width: 100%;
  }
  .question-print-markdown .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.25rem 0;
  }
  .question-print-markdown .katex-display > .katex {
    display: inline-block;
  }
`;

export async function openQuestionPdfExport(markdown: string, meta: QuestionPdfExportMeta = {}): Promise<void> {
    const rawMarkdown = String(markdown || '');
    if (!rawMarkdown.trim()) {
        throw new Error('No markdown available for export');
    }

    const { renderToStaticMarkup } = await import('react-dom/server');

    const markup = renderToStaticMarkup(
        <div className="question-print-shell">
            <div className="question-print-header">
                <h1>{meta.title || 'Question Studio Export'}</h1>
                <p>{meta.subtitle || 'Markdown preview ready for printing.'}</p>
            </div>
            <div className="question-print-section question-print-markdown">
                <QuestionMarkdown markdown={rawMarkdown} />
            </div>
        </div>,
    );

    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) {
        throw new Error('Popup blocked');
    }

    popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Question Studio Export</title>
    <style>${katexCssText}</style>
    <style>${PRINT_CSS}</style>
  </head>
  <body>${markup}</body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
}
