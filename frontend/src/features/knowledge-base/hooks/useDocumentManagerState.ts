import { useEffect, useState } from 'react';
import { knowledgeBaseApi } from '../../../api/knowledgeBaseApi';
import type { ChapterDraft, RetrievalResult } from '../types';
import { extractErrorMessage } from '@/shared/utils/extractError';

export function useDocumentManagerState({
    courseId,
    selectedChapterId,
    chapters,
    onCreateChapter,
    onUpdateChapter,
    onDeleteChapter,
}: {
    courseId: string;
    selectedChapterId: string;
    chapters: any[];
    onCreateChapter: (chapterName: string, description?: string) => Promise<void>;
    onUpdateChapter: (chapterId: string, payload: any) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
}) {
    const [testQuery, setTestQuery] = useState('');
    const [testTopK, setTestTopK] = useState(5);
    const [testResults, setTestResults] = useState<RetrievalResult[] | null>(null);
    const [testLatency, setTestLatency] = useState<number | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    const [newChapterName, setNewChapterName] = useState('');
    const [newChapterDescription, setNewChapterDescription] = useState('');
    const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false);
    const [chapterBusy, setChapterBusy] = useState(false);
    const [chapterActionError, setChapterActionError] = useState('');
    const [chapterActionSuccess, setChapterActionSuccess] = useState('');

    const [reportCommentMap, setReportCommentMap] = useState<Record<string, string>>({});
    const [chapterDraftMap, setChapterDraftMap] = useState<Record<string, ChapterDraft>>({});

    useEffect(() => {
        const next: Record<string, ChapterDraft> = {};
        for (const c of chapters) {
            next[c.chapter_id] = {
                chapter_name: c.chapter_name || '',
                chapter_order: Number(c.chapter_order || 1),
                description: c.description || '',
            };
        }
        setChapterDraftMap(next);
    }, [chapters]);

    const handleTestRetrieval = async () => {
        if (!testQuery.trim() || testLoading) return;
        setTestLoading(true);
        setTestResults(null);
        try {
            const res = await knowledgeBaseApi.testRetrieval(courseId, testQuery.trim(), selectedChapterId, testTopK);
            setTestResults(res.results);
            setTestLatency(res.latency_ms);
        } catch {
            setTestResults([]);
        } finally {
            setTestLoading(false);
        }
    };

    const runChapterAction = async (action: () => Promise<void>, successMessage: string, failureMessage: string) => {
        setChapterBusy(true);
        setChapterActionError('');
        setChapterActionSuccess('');
        try {
            await action();
            setChapterActionSuccess(successMessage);
        } catch (err) {
            setChapterActionError(extractErrorMessage(err, failureMessage));
        } finally {
            setChapterBusy(false);
        }
    };

    const handleCreateChapter = async () => {
        const chapterName = newChapterName.trim();
        if (!chapterName) {
            setChapterActionError('Please enter a chapter name before creating.');
            setChapterActionSuccess('');
            return;
        }
        await runChapterAction(
            async () => {
                await onCreateChapter(chapterName, newChapterDescription.trim());
                setNewChapterName('');
                setNewChapterDescription('');
                setIsAddChapterModalOpen(false);
            },
            'Chapter created successfully.',
            'Failed to create chapter',
        );
    };

    const handleUpdateChapter = async (chapterId: string, draft: ChapterDraft) => {
        await runChapterAction(
            async () => onUpdateChapter(chapterId, draft),
            'Chapter updated successfully.',
            'Failed to update chapter',
        );
    };

    const handleDeleteChapter = async (chapterId: string) => {
        if (!window.confirm('Are you sure you want to delete this chapter?')) return;
        await runChapterAction(
            async () => onDeleteChapter(chapterId),
            'Chapter deleted successfully.',
            'Failed to delete chapter',
        );
    };

    const openAddChapterModal = () => {
        setNewChapterName('');
        setNewChapterDescription('');
        setChapterActionError('');
        setChapterActionSuccess('');
        setIsAddChapterModalOpen(true);
    };

    return {
        testQuery,
        setTestQuery,
        testTopK,
        setTestTopK,
        testResults,
        testLatency,
        testLoading,
        handleTestRetrieval,
        newChapterName,
        setNewChapterName,
        newChapterDescription,
        setNewChapterDescription,
        isAddChapterModalOpen,
        setIsAddChapterModalOpen,
        chapterBusy,
        chapterActionError,
        chapterActionSuccess,
        reportCommentMap,
        setReportCommentMap,
        chapterDraftMap,
        setChapterDraftMap,
        handleCreateChapter,
        handleUpdateChapter,
        handleDeleteChapter,
        openAddChapterModal,
    };
}
