import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QuestionGeneratorPage from './QuestionGeneratorPage';

const {
    mockAiConfigApi,
    mockQuestionApi,
    openPdfMock,
} = vi.hoisted(() => ({
    mockAiConfigApi: {
        get: vi.fn(),
    },
    mockQuestionApi: {
        getGenerationHistory: vi.fn(),
        getGenerationDetail: vi.fn(),
        streamGenerateQuestions: vi.fn(),
        uploadFile: vi.fn(),
        finalizeQuestionHistory: vi.fn(),
        exportQuestionSelection: vi.fn(),
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

vi.mock('@/features/ai-config/api/aiConfigApi', async () => {
    const actual = await vi.importActual<typeof import('@/features/ai-config/api/aiConfigApi')>('@/features/ai-config/api/aiConfigApi');
    return {
        ...actual,
        aiConfigApi: mockAiConfigApi,
    };
});

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

function makeAiConfig() {
    return {
        deepseek: {
            base_url: 'https://api.deepseek.com',
            api_key: '',
            api_key_set: true,
            model: 'deepseek-v4-pro',
            stream: false,
            reasoning_effort: 'high' as const,
            thinking_type: 'enabled' as const,
            updated_at: null,
        },
        openai: {
            base_url: 'https://api.openai.com/v1',
            api_key: '',
            api_key_set: true,
            model: 'gpt-5.5',
            stream: false,
            updated_at: null,
        },
        bigmodel: {
            base_url: 'https://open.bigmodel.cn/api/paas/v4',
            api_key: '',
            api_key_set: false,
            text_model: 'glm-4.5-flash',
            image_model: 'glm-5v-flash',
            stream: false,
            updated_at: null,
        },
        text: {
            deepseek: {
                base_url: 'https://api.deepseek.com',
                api_key: '',
                api_key_set: true,
                model: 'deepseek-v4-pro',
                stream: false,
                reasoning_effort: 'high' as const,
                thinking_type: 'enabled' as const,
                updated_at: null,
            },
            openai: {
                base_url: 'https://api.openai.com/v1',
                api_key: '',
                api_key_set: true,
                model: 'gpt-5.5',
                stream: false,
                updated_at: null,
            },
            bigmodel: {
                base_url: 'https://open.bigmodel.cn/api/paas/v4',
                api_key: '',
                api_key_set: false,
                model: 'glm-4.5-flash',
                stream: false,
                updated_at: null,
            },
        },
        multimodal: {
            openai: {
                base_url: 'https://api.openai.com/v1',
                api_key: '',
                api_key_set: false,
                model: 'gpt-4o',
                stream: false,
                updated_at: null,
            },
            bigmodel: {
                base_url: 'https://open.bigmodel.cn/api/paas/v4',
                api_key: '',
                api_key_set: false,
                model: 'glm-4.5-flash',
                stream: false,
                updated_at: null,
            },
        },
    };
}

describe('QuestionGeneratorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAiConfigApi.get.mockResolvedValue(makeAiConfig());
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

    it('shows configured providers only and streams structured questions', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: /Open Generator/i }));
        await user.click(screen.getByRole('button', { name: /Begin/i }));

        expect(await screen.findByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('DeepSeek')).toBeInTheDocument();
        expect(screen.queryByText('BigModel / GLM')).not.toBeInTheDocument();

        await user.type(screen.getByPlaceholderText(/Paste course notes/i), 'Generate algebra questions.');
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }));

        await waitFor(() => {
            expect(mockQuestionApi.streamGenerateQuestions).toHaveBeenCalled();
        });

        expect(await screen.findByText('Question 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Solve $x + 1 = 3$.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Export Markdown/i })).toBeEnabled();
    });
});
