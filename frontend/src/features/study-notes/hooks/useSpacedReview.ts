import { useState, useCallback } from 'react';
import {
    studyNotesPlanApi,
    type ReviewQueueItem,
    type ReviewRating,
    type StudyPlan,
    type StudyPlanDurationOption,
} from '../api/studyNotesApi';

interface UseSpacedReviewParams {
    notes: string;
    flashcards: unknown[];
    file: File | null;
    setError: (msg: string) => void;
    setIsLoading: (loading: boolean) => void;
    setLoadingText: (text: string) => void;
    setActiveTab: (tab: string) => void;
}

export function useSpacedReview({
    notes,
    flashcards,
    file,
    setError,
    setIsLoading,
    setLoadingText,
    setActiveTab,
}: UseSpacedReviewParams) {
    const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
    const [durationOption, setDurationOption] = useState<StudyPlanDurationOption>('7d');
    const [customDays, setCustomDays] = useState('');
    const [durationError, setDurationError] = useState('');
    const [reviewQueueItem, setReviewQueueItem] = useState<ReviewQueueItem | null>(null);
    const [reviewMessage, setReviewMessage] = useState('Generate a plan, then click Next Review to start.');
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewSubmitting, setReviewSubmitting] = useState<ReviewRating | null>(null);
    const [reviewProgressMap, setReviewProgressMap] = useState<Record<string, number>>({});

    const validateCustomDays = useCallback((rawDays: string): number | null => {
        const parsed = Number.parseInt(rawDays, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) return null;
        return parsed;
    }, []);

    const handleLoadNextReview = useCallback(async () => {
        if (!studyPlan?.plan_id) { setError('Generate a study plan first.'); return; }
        if (reviewLoading) return;

        setReviewLoading(true);
        setError('');
        try {
            const res = await studyNotesPlanApi.getNextReview(studyPlan.plan_id);
            if (res.ready && res.item) {
                setReviewQueueItem(res.item);
                setReviewMessage('Ready to review. Choose a rating after you recall the topic.');
                return;
            }
            setReviewQueueItem(null);
            if (res.next_upcoming?.due_at) {
                const nextAt = new Date(res.next_upcoming.due_at).toLocaleString();
                setReviewMessage(`No item is due now. Next review is scheduled at ${nextAt}.`);
            } else {
                setReviewMessage(res.message || 'No review items available yet.');
            }
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to load the next review item');
        } finally {
            setReviewLoading(false);
        }
    }, [studyPlan?.plan_id, reviewLoading, setError]);

    const handleSubmitReview = useCallback(async (rating: ReviewRating) => {
        if (!reviewQueueItem?.queue_id || reviewSubmitting) return;

        setReviewSubmitting(rating);
        setError('');
        try {
            const res = await studyNotesPlanApi.submitReview({
                queue_id: reviewQueueItem.queue_id,
                rating,
                correct: rating !== 'again',
            });
            setReviewProgressMap((prev) => ({ ...prev, [res.queue_id]: res.repetitions }));
            setReviewQueueItem(null);
            setReviewMessage('Saved. Loading the next item...');
            await handleLoadNextReview();
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to submit review feedback');
        } finally {
            setReviewSubmitting(null);
        }
    }, [reviewQueueItem, reviewSubmitting, handleLoadNextReview, setError]);

    const handleGeneratePlan = useCallback(async () => {
        if (!notes) { setError('Generate study notes first.'); return; }

        const parsedCustomDays = validateCustomDays(customDays);
        if (durationOption === 'custom' && parsedCustomDays === null) {
            setDurationError('Custom days must be an integer between 1 and 90.');
            return;
        }

        setDurationError('');
        const payload = {
            title: file?.name ? `${file.name} Plan` : 'Study Plan',
            notes,
            flashcards,
            duration_option: durationOption,
            custom_days: durationOption === 'custom' ? parsedCustomDays : null,
        };

        setIsLoading(true);
        setLoadingText('Building your study plan...');
        setError('');
        try {
            const res = await studyNotesPlanApi.generatePlan(payload);
            if (res?.success) {
                let createdAt = new Date().toISOString();
                try {
                    const planDetail = await studyNotesPlanApi.getPlan(res.plan_id);
                    createdAt = planDetail?.plan?.created_at || createdAt;
                } catch {
                    // Keep local fallback timestamp when detail fetch fails.
                }
                setStudyPlan({
                    title: payload.title,
                    duration_days: res.duration_days,
                    sessions: res.sessions || [],
                    plan_id: res.plan_id,
                    created_at: createdAt,
                });
                setReviewQueueItem(null);
                setReviewProgressMap({});
                setReviewMessage('Plan created. Click Next Review to fetch your first due item.');
                setActiveTab('plan');
            }
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to generate study plan');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [notes, flashcards, durationOption, customDays, file, validateCustomDays, setError, setIsLoading, setLoadingText, setActiveTab]);

    return {
        studyPlan, setStudyPlan,
        durationOption, setDurationOption,
        customDays, setCustomDays,
        durationError, setDurationError,
        reviewQueueItem,
        reviewMessage,
        reviewLoading,
        reviewSubmitting,
        reviewProgressMap,
        validateCustomDays,
        handleLoadNextReview,
        handleSubmitReview,
        handleGeneratePlan,
    };
}
