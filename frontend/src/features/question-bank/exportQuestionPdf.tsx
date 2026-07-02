import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import katexCssText from 'katex/dist/katex.min.css?inline';

import type { QuestionDraft } from '@/types/api';

import QuestionMarkdown from './components/QuestionMarkdown';
import { buildQuestionsMarkdown } from './questionDraftUtils';

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
`;

export function openQuestionPdfExport(questions: QuestionDraft[]): void {
    const markdown = buildQuestionsMarkdown(questions);
    const markup = renderToStaticMarkup(
        <div className="question-print-shell">
            <div className="question-print-header">
                <h1>Question Studio Export</h1>
                <p>{questions.length} selected question{questions.length === 1 ? '' : 's'}</p>
            </div>
            <div className="question-print-section">
                <QuestionMarkdown markdown={markdown} />
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
