import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuestionGeneratorPage from './QuestionGeneratorPage';

const RAW_MARKDOWN = [
    '1. Question: Solve $x + 1 = 3$.',
    'A. $x=1$',
    'B. $x=2$',
    'Answer: B',
    'Explanation: $x=2$.',
    '',
    '$$y=x^2$$',
    '\\[z = x + y\\]',
].join('\n');

const {
    mockQuestionApi,
    mockAiConfigApi,
    openPdfMock,
} = vi.hoisted(() => ({
    mockQuestionApi: {
        getGenerationHistory: vi.fn(),
        getGenerationDetail: vi.fn(),
        streamGenerateQuestions: vi.fn(),
        uploadFile: vi.fn(),
        finalizeQuestionHistory: vi.fn(),
        exportQuestionSelection: vi.fn(),
    },
    mockAiConfigApi: {
        get: vi.fn(),
    },
    openPdfMock: vi.fn(),
}));

vi.mock('@/features/slides/components/PptGeneratorShell', () => ({
    default: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
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

vi.mock('@/features/ai-config/api/aiConfigApi', () => ({
    aiConfigApi: mockAiConfigApi,
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
    };
});

function renderPage() {
    return render(
        <MemoryRouter>
            <QuestionGeneratorPage />
        </MemoryRouter>,
    );
}

function makeAiConfig(options: {
    openaiConfigured?: boolean;
    claudeConfigured?: boolean;
    bigmodelConfigured?: boolean;
    minimaxConfigured?: boolean;
    deepseekConfigured?: boolean;
} = {}) {
    const {
        openaiConfigured = true,
        claudeConfigured = false,
        bigmodelConfigured = false,
        minimaxConfigured = false,
        deepseekConfigured = false,
    } = options;
    const openai = {
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        api_key_set: openaiConfigured,
        model: 'gpt-5.5',
        stream: false,
        updated_at: '2026-07-02T10:00:00Z',
    };
    const deepseek = {
        base_url: 'https://api.deepseek.com',
        api_key: '',
        api_key_set: deepseekConfigured,
        model: 'deepseek-v4-pro',
        stream: false,
        reasoning_effort: 'high',
        thinking_type: 'enabled',
        updated_at: null,
    };
    const claude = {
        base_url: 'https://api.anthropic.com/v1',
        api_key: '',
        api_key_set: claudeConfigured,
        model: 'claude-sonnet-5',
        stream: false,
        updated_at: null,
    };
    const bigmodelText = {
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: '',
        api_key_set: bigmodelConfigured,
        model: 'glm-4.5-flash',
        stream: false,
        updated_at: null,
    };
    const bigmodel = {
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: '',
        api_key_set: bigmodelConfigured,
        text_model: 'glm-4.5-flash',
        image_model: 'glm-5v-flash',
        stream: false,
        updated_at: null,
    };
    const minimax = {
        base_url: 'https://api.minimaxi.com/v1',
        image_base_url: 'https://api.minimaxi.com/v1',
        api_key: '',
        api_key_set: minimaxConfigured,
        text_model: 'MiniMax-M2.7',
        multimodal_model: 'MiniMax-M3',
        image_model: 'image-01',
        stream: false,
        updated_at: null,
    };

    return {
        deepseek,
        openai,
        claude,
        bigmodel,
        minimax,
        text: {
            deepseek,
            openai,
            claude,
            bigmodel: bigmodelText,
            minimax: {
                base_url: 'https://api.minimaxi.com/v1',
                api_key: '',
                api_key_set: minimaxConfigured,
                model: 'MiniMax-M2.7',
                stream: false,
                updated_at: null,
            },
        },
        multimodal: {
            openai: {
                ...openai,
                api_key_set: false,
                model: 'gpt-4o',
            },
            claude,
            bigmodel: bigmodelText,
            minimax: {
                base_url: 'https://api.minimaxi.com/v1',
                api_key: '',
                api_key_set: minimaxConfigured,
                model: 'MiniMax-M3',
                stream: false,
                updated_at: null,
            },
        },
        image: {
            minimax: {
                base_url: 'https://api.minimaxi.com/v1',
                api_key: '',
                api_key_set: minimaxConfigured,
                model: 'image-01',
                stream: false,
                updated_at: null,
            },
        },
    };
}

function mockSuccessfulStream() {
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
                raw_markdown: '1. Question: Streaming preview.',
            },
        });
        onEvent({
            type: 'complete',
            task_id: 'task-1',
            history_id: 'history-2',
            provider: 'openai',
            provider_source: 'user_ai_config',
            effective_model: 'gpt-5.5',
            markdown: RAW_MARKDOWN,
            question_drafts: [
                {
                    id: 'q1',
                    stem: 'Solve $x + 1 = 3$.',
                    options: ['A. $x=1$', 'B. $x=2$'],
                    answer: 'B',
                    explanation: '$x=2$',
                    raw_markdown: RAW_MARKDOWN,
                },
            ],
            source_kind: 'text',
        });
    });
}

function readBlobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
        reader.readAsText(blob);
    });
}

describe('QuestionGeneratorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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
            result_markdown: RAW_MARKDOWN,
            result_data: {
                markdown: RAW_MARKDOWN,
                questions: [],
                selected_question_ids: [],
            },
            question_drafts: [],
            selected_question_ids: [],
        });
        mockAiConfigApi.get.mockResolvedValue(makeAiConfig());
        mockSuccessfulStream();
        mockQuestionApi.uploadFile.mockResolvedValue({
            success: true,
            filename: 'notes.pdf',
            file_type: 'pdf',
            task_id: 'task-pdf',
            total_pages: 12,
        });
        mockQuestionApi.finalizeQuestionHistory.mockResolvedValue({ success: true, history_id: 'history-2' });
        mockQuestionApi.exportQuestionSelection.mockResolvedValue(new Blob(['legacy'], { type: 'text/markdown' }));
        window.URL.createObjectURL = vi.fn(() => 'blob:download');
        window.URL.revokeObjectURL = vi.fn();
    });

    it('opens directly to prompt, PDF upload, and AI Config model selection', async () => {
        renderPage();

        expect(await screen.findByLabelText('Prompt')).toBeInTheDocument();
        expect(screen.getByText('PDF Upload')).toBeInTheDocument();
        expect(screen.getByText('AI Model & Settings')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'AI Config' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Open Generator/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Begin/i })).not.toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
        });
        expect(screen.getAllByText('gpt-5.5').length).toBeGreaterThan(0);
        expect(screen.getByText('Configured')).toBeInTheDocument();
        expect(screen.getByText('Selected')).toBeInTheDocument();
        expect(screen.queryByText('Local Ollama')).not.toBeInTheDocument();
        expect(screen.queryByText('Auto')).not.toBeInTheDocument();
        expect(screen.getAllByText('6 questions').length).toBeGreaterThan(0);
    });

    it('shows a friendly message when AI Config loading returns a bare 404 message', async () => {
        mockAiConfigApi.get.mockRejectedValueOnce({
            message: 'Request failed with status code 404',
        });

        renderPage();

        expect(await screen.findByText(/Question Studio could not find the required API route/i)).toBeInTheDocument();
        expect(screen.queryByText('Request failed with status code 404')).not.toBeInTheDocument();
    });

    it('sends the provider from the selected AI Config model card', async () => {
        const user = userEvent.setup();
        mockAiConfigApi.get.mockResolvedValue(makeAiConfig({ bigmodelConfigured: true }));
        renderPage();

        await user.click(await screen.findByRole('button', { name: /BigModel \/ GLM/i }));
        await user.type(screen.getByLabelText('Prompt'), 'Generate algebra questions.');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        await waitFor(() => {
            expect(mockQuestionApi.streamGenerateQuestions).toHaveBeenCalled();
        });

        const payload = mockQuestionApi.streamGenerateQuestions.mock.calls[0][0];
        expect(payload.provider).toBe('bigmodel');
    });

    it('generates from prompt with the selected AI Config provider and shows markdown plus preview', async () => {
        const user = userEvent.setup();
        renderPage();

        const promptInput = await screen.findByLabelText('Prompt');
        await user.type(promptInput, 'Generate algebra questions.');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        await waitFor(() => {
            expect(mockQuestionApi.streamGenerateQuestions).toHaveBeenCalled();
        });

        const payload = mockQuestionApi.streamGenerateQuestions.mock.calls[0][0];
        expect(payload.provider).toBe('openai');
        expect(payload.source_text).toBe('Generate algebra questions.');

        const editor = await screen.findByLabelText('Markdown editor') as HTMLTextAreaElement;
        await waitFor(() => {
            expect(editor.value).toBe(RAW_MARKDOWN);
        });
        expect(screen.getByTestId('question-markdown')).toHaveTextContent('Solve $x + 1 = 3$.');
        expect(screen.getByTestId('question-markdown').textContent).toContain('\\[z = x + y\\]');
        expect(screen.getAllByText('gpt-5.5').length).toBeGreaterThan(0);
        expect(screen.getAllByText('AI Config').length).toBeGreaterThan(0);
    });

    it('sends selected PDF page numbers instead of always using the full PDF', async () => {
        const user = userEvent.setup();
        const { container } = renderPage();

        await waitFor(() => {
            expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
        });

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

    it('shows provider failure in the markdown workspace without a fake result', async () => {
        const user = userEvent.setup();
        mockQuestionApi.streamGenerateQuestions.mockImplementationOnce(async (_payload, onEvent) => {
            onEvent({
                type: 'error',
                message: 'Provider openai unavailable for questions.generate: OPENAI_API_KEY is not set',
            });
        });

        renderPage();
        await user.type(await screen.findByLabelText('Prompt'), 'Generate algebra questions.');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        expect(await screen.findByText('Provider openai unavailable for questions.generate: OPENAI_API_KEY is not set')).toBeInTheDocument();
        expect(screen.getByText('No markdown available yet.')).toBeInTheDocument();
        expect(screen.queryByLabelText('Markdown editor')).not.toBeInTheDocument();
    });

    it('exports the edited markdown directly and sends edited markdown to PDF export', async () => {
        const user = userEvent.setup();
        let capturedBlob: Blob | null = null;
        window.URL.createObjectURL = vi.fn((blob: Blob) => {
            capturedBlob = blob;
            return 'blob:download';
        });

        renderPage();
        await user.type(await screen.findByLabelText('Prompt'), 'Generate algebra questions.');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        const editor = await screen.findByLabelText('Markdown editor') as HTMLTextAreaElement;
        await waitFor(() => {
            expect(editor.value).toBe(RAW_MARKDOWN);
        });

        const editedMarkdown = `${RAW_MARKDOWN}\n\n2. Question: Edited with \\(a+b\\).`;
        fireEvent.change(editor, { target: { value: editedMarkdown } });
        await waitFor(() => {
            expect(screen.getByTestId('question-markdown')).toHaveTextContent('Edited with \\(a+b\\).');
        });

        await user.click(screen.getByRole('button', { name: /Export Markdown/i }));

        await waitFor(() => {
            expect(mockQuestionApi.finalizeQuestionHistory).toHaveBeenCalled();
        });
        expect(mockQuestionApi.finalizeQuestionHistory.mock.calls.at(-1)?.[1].markdown).toBe(editedMarkdown);
        expect(mockQuestionApi.exportQuestionSelection).not.toHaveBeenCalled();
        expect(capturedBlob).not.toBeNull();
        const exportedMarkdown = await readBlobText(capturedBlob!);
        expect(exportedMarkdown).toBe(editedMarkdown);

        await user.click(screen.getByRole('button', { name: /Export PDF/i }));
        expect(openPdfMock).toHaveBeenCalledWith(editedMarkdown);
    });

    it('reopens history from stored result markdown even when structured drafts are absent', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: /Open Result/i }));

        const editor = await screen.findByLabelText('Markdown editor') as HTMLTextAreaElement;
        expect(editor.value).toBe(RAW_MARKDOWN);
        expect(screen.getByTestId('question-markdown')).toHaveTextContent('Solve $x + 1 = 3$.');
    });
});
