import { useEffect, useState } from 'react';
import { knowledgeBaseApi } from '../../../api/knowledgeBaseApi';
import type {
    ChapterDraft,
    EvidenceSpan,
    RetrievalConfidence,
    RetrievalPlan,
    RetrievalResult,
    RetrievalTraceItem,
} from '../types';
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
    const [testDebug, setTestDebug] = useState(true);
    const [activeIndexVersion, setActiveIndexVersion] = useState<string>('');
    const [testProfile, setTestProfile] = useState<'low-latency' | 'balanced' | 'high-recall'>('balanced');
    const [forceQueryClass, setForceQueryClass] = useState<'' | 'keyword/factoid' | 'concept/explanation' | 'comparison' | 'multi-hop' | 'chapter/doc constrained' | 'out-of-domain'>('');
    const [allowWebCorrection, setAllowWebCorrection] = useState(false);
    const [retrievalPlan, setRetrievalPlan] = useState<RetrievalPlan | null>(null);
    const [retrievalTrace, setRetrievalTrace] = useState<RetrievalTraceItem[]>([]);
    const [retrievalConfidence, setRetrievalConfidence] = useState<RetrievalConfidence | null>(null);
    const [fallbackReason, setFallbackReason] = useState('');
    const [evidenceSpans, setEvidenceSpans] = useState<EvidenceSpan[]>([]);

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
        setRetrievalPlan(null);
        setRetrievalTrace([]);
        setRetrievalConfidence(null);
        setFallbackReason('');
        setEvidenceSpans([]);
        try {
            const res = await knowledgeBaseApi.testRetrieval(
                courseId,
                testQuery.trim(),
                selectedChapterId,
                testTopK,
                testDebug,
                testProfile,
                testDebug,
                allowWebCorrection,
                forceQueryClass,
            );
            setTestResults(res.results);
            setTestLatency(res.latency_ms);
            setActiveIndexVersion(res.active_index_version || '');
            setRetrievalPlan(res.retrieval_plan || null);
            setRetrievalTrace(res.retrieval_trace || []);
            setRetrievalConfidence(res.retrieval_confidence || null);
            setFallbackReason(res.fallback_reason || '');
            setEvidenceSpans(res.evidence_spans || []);
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
        testDebug,
        setTestDebug,
        activeIndexVersion,
        testProfile,
        setTestProfile,
        forceQueryClass,
        setForceQueryClass,
        allowWebCorrection,
        setAllowWebCorrection,
        retrievalPlan,
        retrievalTrace,
        retrievalConfidence,
        fallbackReason,
        evidenceSpans,
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
