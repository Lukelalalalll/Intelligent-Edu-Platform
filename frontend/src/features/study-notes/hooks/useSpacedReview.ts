import { useState, useCallback, useRef } from 'react';
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
    const [reviewMessage, setReviewMessage] = useState('Generate a plan first, then click Next Review to start.');
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewSubmitting, setReviewSubmitting] = useState<ReviewRating | null>(null);
    const [reviewProgressMap, setReviewProgressMap] = useState<Record<string, number>>({});
    // Dedicated inline error for the review panel — separate from the global page error
    const [reviewError, setReviewError] = useState('');

    // Use a ref for reviewLoading so the guard check always sees the latest value
    // without stale-closure issues from useCallback deps.
    const reviewLoadingRef = useRef(false);

    const validateCustomDays = useCallback((rawDays: string): number | null => {
        const parsed = Number.parseInt(rawDays, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) return null;
        return parsed;
    }, []);

    const handleLoadNextReview = useCallback(async (planId?: string) => {
        // Use the ref instead of closure state to avoid stale-closure silent no-ops
        if (reviewLoadingRef.current) return;

        const targetPlanId = planId ?? studyPlan?.plan_id;
        if (!targetPlanId) {
            setReviewError('Generate a study plan first.');
            return;
        }

        reviewLoadingRef.current = true;
        setReviewLoading(true);
        setReviewError('');
        try {
            const res = await studyNotesPlanApi.getNextReview(targetPlanId);
            if (res.ready && res.item) {
                setReviewQueueItem(res.item);
                setReviewMessage('Topic ready for review — try to recall it, then rate how well you remembered.');
                return;
            }
            setReviewQueueItem(null);
            if (res.next_upcoming?.due_at) {
                const nextAt = new Date(res.next_upcoming.due_at).toLocaleString();
                setReviewMessage(`All caught up! Next review scheduled for ${nextAt}.`);
            } else {
                setReviewMessage(res.message || 'No review items available yet.');
            }
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setReviewError(typeof detail === 'string' ? detail : 'Failed to load next review item.');
        } finally {
            reviewLoadingRef.current = false;
            setReviewLoading(false);
        }
    }, [studyPlan?.plan_id]);

    const handleSubmitReview = useCallback(async (rating: ReviewRating) => {
        if (!reviewQueueItem?.queue_id || reviewSubmitting) return;

        setReviewSubmitting(rating);
        setReviewError('');
        try {
            const res = await studyNotesPlanApi.submitReview({
                queue_id: reviewQueueItem.queue_id,
                rating,
                correct: rating !== 'again',
            });
            setReviewProgressMap((prev) => ({ ...prev, [res.queue_id]: res.repetitions }));
            setReviewQueueItem(null);
            setReviewMessage('Great! Loading next item...');
            // Pass plan_id directly to avoid stale closure in handleLoadNextReview
            await handleLoadNextReview(reviewQueueItem.plan_id ?? studyPlan?.plan_id);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setReviewError(typeof detail === 'string' ? detail : 'Failed to submit review feedback.');
        } finally {
            setReviewSubmitting(null);
        }
    }, [reviewQueueItem, reviewSubmitting, handleLoadNextReview, studyPlan?.plan_id]);

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
                setReviewError('');
                setReviewMessage('Plan created! Loading your first review item...');
                setActiveTab('plan');
                // Auto-load the first due review item — pass plan_id directly
                // so we don't depend on studyPlan state being updated yet.
                await handleLoadNextReview(res.plan_id);
            }
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to generate study plan');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [notes, flashcards, durationOption, customDays, file, validateCustomDays, setError, setIsLoading, setLoadingText, setActiveTab, handleLoadNextReview]);

    return {
        studyPlan, setStudyPlan,
        durationOption, setDurationOption,
        customDays, setCustomDays,
        durationError, setDurationError,
        reviewQueueItem,
        reviewMessage,
        reviewError,
        reviewLoading,
        reviewSubmitting,
        reviewProgressMap,
        validateCustomDays,
        handleLoadNextReview,
        handleSubmitReview,
        handleGeneratePlan,
    };
}
