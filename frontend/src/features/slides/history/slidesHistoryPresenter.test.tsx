import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    getSlidesHistorySummary,
    renderSlidesHistoryCard,
    renderSlidesHistoryDetailContent,
} from './slidesHistoryPresenter';

describe('slidesHistoryPresenter', () => {
    it('builds a readable summary for list cards', () => {
        const summary = getSlidesHistorySummary({
            id: '1',
            tool: 'generate_render',
            preview: 'Generated 6 slides',
            created_at: '2026-06-18T10:00:00.000Z',
            params: {
                tool: 'generate_render',
                provider: 'openai',
                base_style: 'neon_tech',
            },
            source: {
                source_display_name: 'Lecture Notes.pdf',
            },
        });

        expect(summary.subject).toBe('generate render');
        expect(summary.chips).toContain('openai');
        expect(summary.chips).toContain('Lecture Notes.pdf');
        expect(summary.preview).toBe('Generated 6 slides');
    });

    it('renders workflow, result, and initial file sections for slides detail', () => {
        const onDownload = vi.fn();
        render(
            renderSlidesHistoryDetailContent(
                {
                    id: '1',
                    tool: 'generate_render',
                    params: { tool: 'generate_render', provider: 'openai' },
                    result: '{"pptx_download_url":"/api/slides/download_ppt/deck.pptx"}',
                    slides_detail: {
                        request_id: 'req-1',
                        workflow: {
                            request_id: 'req-1',
                            task_type: 'generate_render',
                            status: 'success',
                            total_latency_ms: 1234,
                            created_at: '2026-06-18T10:00:00.000Z',
                            steps: [
                                {
                                    step: 'render',
                                    status: 'success',
                                    latency_ms: 800,
                                    started_at: '2026-06-18T10:00:00.000Z',
                                    metadata: { base_style: 'neon_tech' },
                                },
                            ],
                        },
                        source_artifacts: {
                            kind: 'upload',
                            source_filename: 'stored.pdf',
                            source_display_name: 'Lecture Notes.pdf',
                            source_download_url: '/api/slides/download_source/stored.pdf',
                            combined_markdown_filename: 'combined_stored.md',
                            combined_markdown_download_url: '/api/slides/download/combined_stored.md',
                        },
                        result_artifacts: {
                            title: 'Deck',
                            page_count: 6,
                            pptx_filename: 'deck.pptx',
                            pptx_download_url: '/api/slides/download_ppt/deck.pptx',
                            html_preview_filename: 'deck.html',
                            html_preview_url: '/api/slides/download_html/deck.html',
                        },
                    },
                },
                onDownload,
            ),
        );

        expect(screen.getByText('Workflow Record')).toBeInTheDocument();
        expect(screen.getByText('Result')).toBeInTheDocument();
        expect(screen.getByText('Initial File')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download pptx/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download initial file/i })).toBeInTheDocument();
        expect(screen.getByText('Lecture Notes.pdf')).toBeInTheDocument();
    });

    it('renders a sensible fallback when artifacts are missing', () => {
        render(
            renderSlidesHistoryDetailContent(
                {
                    id: 'legacy',
                    tool: 'generate_render',
                    result: 'legacy raw text',
                    params: {},
                },
                vi.fn(),
            ),
        );

        expect(screen.getByText(/workflow metadata is unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/source artifact metadata is unavailable/i)).toBeInTheDocument();
        expect(screen.getByText('legacy raw text')).toBeInTheDocument();
    });

    it('renders a card fragment', () => {
        render(<div>{renderSlidesHistoryCard({
            id: '2',
            tool: 'generate_render',
            preview: 'Generated 4 slides',
            created_at: '2026-06-18T10:00:00.000Z',
            params: { tool: 'generate_render', provider: 'deepseek' },
            source: { source_display_name: 'Deck.md' },
        })}</div>);

        expect(screen.getByText('generate render')).toBeInTheDocument();
        expect(screen.getByText('Generated 4 slides')).toBeInTheDocument();
    });
});

