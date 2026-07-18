import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuestionGeneratorPage from './QuestionGeneratorPage';

const {
    mockQuestionApi,
    openPdfMock,
} = vi.hoisted(() => ({
    mockQuestionApi: {
        getGenerationHistory: vi.fn(),
        getGenerationDetail: vi.fn(),
        streamGenerateQuestions: vi.fn(),
        uploadFile: vi.fn(),
        finalizeQuestionHistory: vi.fn(),
        exportQuestionSelection: vi.fn(),
        listQuestionProviders: vi.fn(),
    },
    openPdfMock: vi.fn(),
}));

vi.mock('@/features/slides/components/PptGeneratorShell', () => ({
    default: ({ toolbar, children }: { toolbar?: React.ReactNode; children: React.ReactNode }) => (
        <div>
            <div>{toolbar}</div>
            <div>{children}</div>
        </div>
    ),
}));

vi.mock('@/shared/ToastContainer', () => ({
    default: () => null,
}));

vi.mock('../../chat/api/transferApi', () => ({
    transferApi: {
        transferConsumeAndDownload: vi.fn(),
    },
}));

vi.mock('../components/QuestionMarkdown', () => ({
    default: ({ markdown }: { markdown: string }) => <div data-testid="question-markdown">{markdown}</div>,
}));

vi.mock('../exportQuestionPdf', () => ({
    openQuestionPdfExport: openPdfMock,
}));

vi.mock('../api/questionBankApi', async () => {
    const actual = await vi.importActual<typeof import('../api/questionBankApi')>('../api/questionBankApi');
    return {
        ...actual,
        getGenerationHistory: mockQuestionApi.getGenerationHistory,
        getGenerationDetail: mockQuestionApi.getGenerationDetail,
        streamGenerateQuestions: mockQuestionApi.streamGenerateQuestions,
        uploadFile: mockQuestionApi.uploadFile,
        finalizeQuestionHistory: mockQuestionApi.finalizeQuestionHistory,
        exportQuestionSelection: mockQuestionApi.exportQuestionSelection,
        listQuestionProviders: mockQuestionApi.listQuestionProviders,
    };
});

function renderPage() {
    return render(
        <MemoryRouter>
            <QuestionGeneratorPage />
        </MemoryRouter>,
    );
}

function makeProviders() {
    return [
        {
            id: 'auto',
            label: 'Auto',
            available: true,
            configured: true,
            source: 'auto',
            model: 'gpt-5.5',
            message: 'Will use openai (gpt-5.5)',
            is_recommended: false,
        },
        {
            id: 'openai',
            label: 'OpenAI',
            available: true,
            configured: true,
            source: 'user_ai_config',
            model: 'gpt-5.5',
            message: 'ok',
            is_recommended: true,
        },
        {
            id: 'local_ollama',
            label: 'Local Ollama',
            available: true,
            configured: true,
            source: 'global_service',
            model: 'llama3.2',
            message: 'ok',
            is_recommended: false,
        },
    ];
}

describe('QuestionGeneratorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        mockQuestionApi.getGenerationHistory.mockResolvedValue({
            items: [
                {
                    id: 'history-1',
                    created_at: '2026-07-02T10:00:00Z',
                    preview: 'Preview',
                    params: {
                        question_type: 'Multiple choice',
                        num_questions: 6,
                        difficulty: 3,
                        output_language: 'English',
                        source_kind: 'pdf',
                    },
                },
            ],
            total: 1,
        });
        mockQuestionApi.getGenerationDetail.mockResolvedValue({
            success: true,
            id: 'history-1',
            question_drafts: [],
            selected_question_ids: [],
        });
        mockQuestionApi.listQuestionProviders.mockResolvedValue({
            providers: makeProviders(),
        });
        mockQuestionApi.streamGenerateQuestions.mockImplementation(async (_payload, onEvent) => {
            onEvent({ type: 'status', phase: 'generating', message: 'Generating question set' });
            onEvent({
                type: 'question',
                index: 0,
                question: {
                    id: 'q1',
                    stem: 'Solve $x + 1 = 3$.',
                    options: ['A. $x=1$', 'B. $x=2$'],
                    answer: 'B',
                    explanation: '$x=2$',
                    raw_markdown: '',
                },
            });
            onEvent({
                type: 'complete',
                task_id: 'task-1',
                history_id: 'history-2',
                provider: 'openai',
                provider_source: 'user_ai_config',
                effective_model: 'gpt-5.5',
                markdown: '1. Question: Solve $x + 1 = 3$.',
                question_drafts: [
                    {
                        id: 'q1',
                        stem: 'Solve $x + 1 = 3$.',
                        options: ['A. $x=1$', 'B. $x=2$'],
                        answer: 'B',
                        explanation: '$x=2$',
                        raw_markdown: '',
                    },
                ],
                source_kind: 'text',
            });
        });
        mockQuestionApi.uploadFile.mockResolvedValue({
            success: true,
            filename: 'notes.pdf',
            file_type: 'pdf',
            task_id: 'task-pdf',
            total_pages: 12,
        });
        mockQuestionApi.finalizeQuestionHistory.mockResolvedValue({ success: true, history_id: 'history-2' });
        mockQuestionApi.exportQuestionSelection.mockResolvedValue(new Blob(['hello'], { type: 'text/markdown' }));
        window.URL.createObjectURL = vi.fn(() => 'blob:download');
        window.URL.revokeObjectURL = vi.fn();
    });

    it('renders hub cards and history strip', async () => {
        renderPage();

        expect(await screen.findByText('Generate Question')).toBeInTheDocument();
        expect(screen.getByText('Extract Question')).toBeInTheDocument();
        expect(await screen.findByText('History')).toBeInTheDocument();
        expect(screen.getByText('6 questions')).toBeInTheDocument();
    });

    it('supports prompt-only generation with backend provider status and shows source/model', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: /Open Generator/i }));
        await user.click(screen.getByRole('button', { name: /Begin/i }));

        expect(await screen.findByText('This selector prefers healthy models from your AI Config.')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'OpenAI · gpt-5.5' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /Local Ollama/i })).not.toBeInTheDocument();

        await user.type(screen.getByPlaceholderText(/Paste course notes/i), 'Generate algebra questions.');
        expect(screen.getByRole('button', { name: /Generate Questions/i })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        await waitFor(() => {
            expect(mockQuestionApi.streamGenerateQuestions).toHaveBeenCalled();
        });

        const payload = mockQuestionApi.streamGenerateQuestions.mock.calls[0][0];
        expect(payload.provider).toBe('openai');
        expect(await screen.findByText('Question 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Solve $x + 1 = 3$.')).toBeInTheDocument();
        expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
        expect(screen.getAllByText('gpt-5.5').length).toBeGreaterThan(0);
    });

    it('sends selected page numbers instead of always using the full PDF', async () => {
        const user = userEvent.setup();
        const { container } = renderPage();

        await user.click(await screen.findByRole('button', { name: /Open Generator/i }));
        await user.click(screen.getByRole('button', { name: /Begin/i }));

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        const pdfFile = new File(['pdf'], 'notes.pdf', { type: 'application/pdf' });
        await user.upload(fileInput, pdfFile);

        expect(await screen.findByText('12 pages')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Generate Questions/i })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Selected pages' }));
        await user.type(screen.getByPlaceholderText('e.g. 1-3, 6, 9'), '1-3, 6');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        await waitFor(() => {
            expect(mockQuestionApi.streamGenerateQuestions).toHaveBeenCalled();
        });

        const payload = mockQuestionApi.streamGenerateQuestions.mock.calls[0][0];
        expect(payload.page_numbers).toEqual([0, 1, 2, 5]);
    });

    it('shows provider failure from the stream instead of pretending generation succeeded', async () => {
        const user = userEvent.setup();
        mockQuestionApi.streamGenerateQuestions.mockImplementationOnce(async (_payload, onEvent) => {
            onEvent({
                type: 'error',
                message: 'Provider openai unavailable for questions.generate: OPENAI_API_KEY is not set',
            });
        });

        renderPage();
        await user.click(await screen.findByRole('button', { name: /Open Generator/i }));
        await user.click(screen.getByRole('button', { name: /Begin/i }));
        await user.type(screen.getByPlaceholderText(/Paste course notes/i), 'Generate algebra questions.');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        expect(await screen.findByText('Provider openai unavailable for questions.generate: OPENAI_API_KEY is not set')).toBeInTheDocument();
        expect(screen.getByText('No questions available yet.')).toBeInTheDocument();
    });
});
