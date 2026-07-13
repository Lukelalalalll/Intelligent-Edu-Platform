import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GradingWorkbenchPage from './GradingWorkbenchPage';

const routeState = vi.hoisted(() => ({
    submissionId: 'sub-1',
    locationState: undefined as unknown,
}));

const teacherApiMock = vi.hoisted(() => ({
    getSubmissionDetailV2: vi.fn(),
    getSubmissionDetail: vi.fn(),
    finalizeAnnotations: vi.fn(),
    saveScore: vi.fn(),
}));

const aiProviderMock = vi.hoisted(() => ({
    getStoredAIProvider: vi.fn(() => 'local_ollama'),
    setStoredAIProvider: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ submissionId: routeState.submissionId }),
        useLocation: () => ({ state: routeState.locationState }),
    };
});

vi.mock('@/shared/api/client', () => ({
    resolveApiRoot: () => 'http://api.test',
}));

vi.mock('@/api/mailboxApi', () => ({
    teacherApi: teacherApiMock,
}));

vi.mock('../../../shared/aiProvider', () => ({
    ...aiProviderMock,
}));

vi.mock('../components/PDFViewer', () => ({
    default: ({ file, annotations = [], onSaveAnnotation }: any) => (
        <div data-testid="pdf-viewer" data-file={file ?? ''} data-annotation-count={String(annotations.length)}>
            <button
                type="button"
                onClick={() => onSaveAnnotation?.({
                    pageNumber: 1,
                    x: 0.25,
                    y: 0.5,
                    title: 'Draft label',
                    comment: 'Draft note',
                })}
            >
                Mock Add Draft
            </button>
        </div>
    ),
}));

vi.mock('../components/CozeAssistant', () => ({
    default: ({ onAnalysis, submissionId }: any) => (
        <div data-testid="coze-assistant" data-submission-id={submissionId}>
            <button
                type="button"
                onClick={() => onAnalysis?.({
                    parsed: {
                        overall_score: 88,
                        overall_feedback: 'AI feedback',
                        rubric_scores: [{ criterion: 'clarity', score: 8 }],
                    },
                })}
            >
                Analyze Submission
            </button>
        </div>
    ),
}));

vi.mock('../components/RubricPanel', () => ({
    default: ({ rubric, existingScores }: any) => (
        <div
            data-testid="rubric-panel"
            data-total={String(existingScores?.totalScore ?? '')}
            data-feedback={String(existingScores?.overallFeedback ?? '')}
            data-rubric={JSON.stringify(rubric ?? {})}
        />
    ),
}));

function createSubmissionDetail(overrides: Record<string, unknown> = {}) {
    return {
        course: { id: 'course-1' },
        assignment: {
            title: 'Essay 1',
            description: 'Assess the essay',
            rubric: { clarity: 10 },
        },
        submission: {
            pdfPath: 'uploads/essay 1.pdf',
            studentName: 'Alice',
        },
        annotations: {
            annotations: [],
            totalScore: 61,
            rubricScores: { clarity: 6 },
            overallFeedback: 'Stored score',
        },
        grade: {
            totalScore: 71,
            rubricScores: { clarity: 7 },
            overallFeedback: 'Teacher score',
        },
        ...overrides,
    };
}

describe('GradingWorkbenchPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        routeState.submissionId = 'sub-1';
        routeState.locationState = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads submission data from v2 and renders the normalized PDF URL', async () => {
        teacherApiMock.getSubmissionDetailV2.mockResolvedValue(createSubmissionDetail());

        render(<GradingWorkbenchPage />);

        expect(await screen.findByText('Alice')).toBeInTheDocument();
        await waitFor(() => expect(teacherApiMock.getSubmissionDetailV2).toHaveBeenCalledWith('sub-1'));
        expect(teacherApiMock.getSubmissionDetail).not.toHaveBeenCalled();
        expect(screen.getByTestId('pdf-viewer').getAttribute('data-file')).toContain(
            'http://api.test/uploads/essay%201.pdf?v=',
        );
    });

    it('falls back to the legacy submission detail endpoint when v2 fails', async () => {
        teacherApiMock.getSubmissionDetailV2.mockRejectedValue({ response: { status: 500 } });
        teacherApiMock.getSubmissionDetail.mockResolvedValue(createSubmissionDetail({
            submission: {
                pdfPath: 'legacy/fallback.pdf',
                studentName: 'Legacy student',
            },
        }));

        render(<GradingWorkbenchPage />);

        expect(await screen.findByText('Legacy student')).toBeInTheDocument();
        await waitFor(() => expect(teacherApiMock.getSubmissionDetail).toHaveBeenCalledWith('sub-1'));
        expect(screen.getByTestId('pdf-viewer').getAttribute('data-file')).toContain(
            'http://api.test/legacy/fallback.pdf?v=',
        );
    });

    it('switches to the scorer pane and injects AI suggestions after analysis', async () => {
        teacherApiMock.getSubmissionDetailV2.mockResolvedValue(createSubmissionDetail());

        render(<GradingWorkbenchPage />);

        fireEvent.click(await screen.findByText('Analyze Submission'));

        const rubricPanel = await screen.findByTestId('rubric-panel');
        expect(rubricPanel).toHaveAttribute('data-total', '88');
        expect(rubricPanel).toHaveAttribute('data-feedback', 'AI feedback');
        expect(screen.queryByTestId('coze-assistant')).not.toBeInTheDocument();
    });

    it('reloads when submissionId changes, clears AI suggestions, and rebuilds the PDF URL', async () => {
        teacherApiMock.getSubmissionDetailV2
            .mockResolvedValueOnce(createSubmissionDetail({
                submission: {
                    pdfPath: 'uploads/essay one.pdf',
                    studentName: 'Alice',
                },
                grade: {
                    totalScore: 71,
                    rubricScores: { clarity: 7 },
                    overallFeedback: 'Teacher score A',
                },
            }))
            .mockResolvedValueOnce(createSubmissionDetail({
                submission: {
                    pdfPath: 'uploads/essay two.pdf',
                    studentName: 'Bob',
                },
                grade: {
                    totalScore: 61,
                    rubricScores: { clarity: 6 },
                    overallFeedback: 'Teacher score B',
                },
            }));

        const view = render(<GradingWorkbenchPage />);

        await screen.findByText('Alice');
        fireEvent.click(await screen.findByText('Analyze Submission'));
        expect(await screen.findByTestId('rubric-panel')).toHaveAttribute('data-total', '88');

        routeState.submissionId = 'sub-2';
        view.rerender(<GradingWorkbenchPage />);

        await waitFor(() => expect(teacherApiMock.getSubmissionDetailV2).toHaveBeenLastCalledWith('sub-2'));
        await waitFor(() => expect(screen.getByTestId('rubric-panel')).toHaveAttribute('data-total', '61'));
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByTestId('pdf-viewer').getAttribute('data-file')).toContain(
            'http://api.test/uploads/essay%20two.pdf?v=',
        );
    });

    it('keeps the draft-finalize PDF flow intact and refreshes the viewer URL after finalize', async () => {
        let now = 1000;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            now += 1;
            return now;
        });
        teacherApiMock.getSubmissionDetailV2.mockResolvedValue(createSubmissionDetail({
            submission: {
                pdfPath: 'uploads/essay.pdf',
                studentName: 'Alice',
            },
            annotations: {
                annotations: [],
            },
            grade: null,
        }));
        teacherApiMock.finalizeAnnotations.mockResolvedValue({
            annotations: [],
            pdfPath: 'uploads/essay.pdf',
        });

        render(<GradingWorkbenchPage />);

        await screen.findByText('Alice');
        const initialPdfUrl = screen.getByTestId('pdf-viewer').getAttribute('data-file');

        fireEvent.click(screen.getByText('Mock Add Draft'));

        await screen.findByText('Draft Labels');
        fireEvent.click(screen.getByRole('button', { name: 'Finalize Save To PDF' }));

        await waitFor(() => expect(teacherApiMock.finalizeAnnotations).toHaveBeenCalledWith(
            'sub-1',
            expect.arrayContaining([
                expect.objectContaining({
                    comment: 'Draft note',
                    title: 'Draft label',
                }),
            ]),
        ));
        await waitFor(() => expect(screen.queryByText('Draft Labels')).not.toBeInTheDocument());

        const nextPdfUrl = screen.getByTestId('pdf-viewer').getAttribute('data-file');
        expect(nextPdfUrl).not.toBe(initialPdfUrl);
    });
});
