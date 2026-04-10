import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { chatApi } from '../../api/chatApi';
import StudyNotes from '../../features/study-notes/StudyNotes';
import styles from '../../features/study-notes/styles/sub5.module.css';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../shared/aiProvider';
import {
    studyNotesPlanApi,
    type ReviewQueueItem,
    type ReviewRating,
    type StudyPlan,
    type StudyPlanDurationOption,
} from '../../api/studyNotesPlanApi';

export default function StudyNotesEntry() {
    const fileInputRef = useRef(null);
    const [searchParams, setSearchParams] = useSearchParams();

    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [style, setStyle] = useState('detailed');
    const [notes, setNotes] = useState('');
    const [flashcards, setFlashcards] = useState([]);
    const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('notes');
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());
    const [durationOption, setDurationOption] = useState<StudyPlanDurationOption>('7d');
    const [customDays, setCustomDays] = useState('');
    const [durationError, setDurationError] = useState('');
    const [reviewQueueItem, setReviewQueueItem] = useState<ReviewQueueItem | null>(null);
    const [reviewMessage, setReviewMessage] = useState('Generate a plan, then click Next Review to start.');
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewSubmitting, setReviewSubmitting] = useState<ReviewRating | null>(null);
    const [reviewProgressMap, setReviewProgressMap] = useState<Record<string, number>>({});

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    // Transfer ticket auto-consumption
    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId) return;

        let cancelled = false;
        (async () => {
            setIsLoading(true);
            setLoadingText('Receiving file from chat...');
            setError('');
            try {
                const { file: transferFile, meta } = await chatApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;

                // Set the file so the normal upload flow works
                setFile(transferFile);

                // Apply transfer options
                const transferStyle = (meta.target_options?.style && typeof meta.target_options.style === 'string')
                    ? meta.target_options.style : style;
                if (transferStyle !== style) setStyle(transferStyle);

                // Clean up transfer_id from URL
                searchParams.delete('transfer_id');
                setSearchParams(searchParams, { replace: true });

                // Auto-trigger generation
                await generateFromFile(transferFile, transferStyle);
            } catch (err) {
                if (cancelled) return;
                const msg = err instanceof Error ? err.message : 'Transfer failed';
                setError(`Transfer error: ${msg}`);
                setIsLoading(false);
                setLoadingText('');
            }
        })();

        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') setFile(f);
    };
    const handleFileInput = (e) => {
        const f = e.target.files[0];
        if (f) setFile(f);
        e.target.value = '';
    };

    const generateFromFile = useCallback(async (targetFile, targetStyle) => {
        if (!targetFile) return;
        setIsLoading(true);
        setLoadingText('Extracting text and generating study notes...');
        setError('');

        try {
            // Generate notes
            const formData = new FormData();
            formData.append('file', targetFile);
            formData.append('style', targetStyle);
            formData.append('provider', provider);
            const notesRes = await client.post('/study-notes/generate-notes', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (notesRes.data.success) {
                setNotes(notesRes.data.notes);
                setStudyPlan(null);
                setActiveTab('notes');
            }

            // Generate flashcards
            setLoadingText('Generating flashcards...');
            const flashForm = new FormData();
            flashForm.append('file', targetFile);
            flashForm.append('provider', provider);
            const flashRes = await client.post('/study-notes/generate-flashcards', flashForm, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (flashRes.data.success && flashRes.data.flashcards?.length > 0) {
                setFlashcards(flashRes.data.flashcards);
            }
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to generate notes');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [provider]);

    const handleGenerate = useCallback(async () => {
        await generateFromFile(file, style);
    }, [file, style, generateFromFile]);

    const validateCustomDays = useCallback((rawDays: string): number | null => {
        const parsed = Number.parseInt(rawDays, 10);
        if (!Number.isFinite(parsed)) {
            return null;
        }
        if (parsed < 1 || parsed > 90) {
            return null;
        }
        return parsed;
    }, []);

    const handleLoadNextReview = useCallback(async () => {
        if (!studyPlan?.plan_id) {
            setError('Generate a study plan first.');
            return;
        }

        if (reviewLoading) {
            return;
        }

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
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to load the next review item');
        } finally {
            setReviewLoading(false);
        }
    }, [studyPlan?.plan_id, reviewLoading]);

    const handleSubmitReview = useCallback(async (rating: ReviewRating) => {
        if (!reviewQueueItem?.queue_id || reviewSubmitting) {
            return;
        }

        setReviewSubmitting(rating);
        setError('');
        try {
            const res = await studyNotesPlanApi.submitReview({
                queue_id: reviewQueueItem.queue_id,
                rating,
                correct: rating !== 'again',
            });

            setReviewProgressMap((prev) => ({
                ...prev,
                [res.queue_id]: res.repetitions,
            }));

            setReviewQueueItem(null);
            setReviewMessage('Saved. Loading the next item...');
            await handleLoadNextReview();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to submit review feedback');
        } finally {
            setReviewSubmitting(null);
        }
    }, [reviewQueueItem, reviewSubmitting, handleLoadNextReview]);

    const handleGeneratePlan = useCallback(async () => {
        if (!notes) {
            setError('Generate study notes first.');
            return;
        }

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
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to generate study plan');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [notes, flashcards, durationOption, customDays, file, validateCustomDays]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1><i className="fas fa-book-reader"></i> AI Study Notes Generator</h1>
                <p className={styles.subtitle}>Upload lecture PDFs to generate structured notes and flashcards</p>
            </header>

            {/* Upload */}
            <div className={styles.uploadCard}>
                <div
                    className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <i className="fas fa-cloud-upload-alt"></i>
                    <p>{file ? '' : 'Drag & drop your lecture PDF here, or click to browse'}</p>
                    {file && <p className={styles.fileName}>{file.name}</p>}
                    <input type="file" accept=".pdf" className={styles.fileInput} ref={fileInputRef} onChange={handleFileInput} />
                </div>

                <div className={styles.controls}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-sub)' }}>Style:</span>
                    <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                        <option value="coze">Coze</option>
                        <option value="local_ollama">llama3.2</option>
                    </select>
                    {['detailed', 'concise', 'exam'].map((s) => (
                        <button
                            key={s}
                            className={`${styles.styleBtn} ${style === s ? styles.styleBtnActive : ''}`}
                            onClick={() => setStyle(s)}
                        >
                            {s === 'detailed' ? 'Detailed' : s === 'concise' ? 'Concise' : 'Exam Prep'}
                        </button>
                    ))}
                    <button
                        className={styles.generateBtn}
                        onClick={handleGenerate}
                        disabled={!file || isLoading}
                    >
                        {isLoading
                            ? <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                            : <><i className="fas fa-magic"></i> Generate</>
                        }
                    </button>
                </div>

                <div className={styles.planControls}>
                    <span className={styles.planLabel}>Plan Duration:</span>
                    {['3d', '7d', '14d', 'custom'].map((opt) => (
                        <button
                            key={opt}
                            className={`${styles.durationBtn} ${durationOption === opt ? styles.durationBtnActive : ''}`}
                            onClick={() => {
                                setDurationOption(opt as StudyPlanDurationOption);
                                if (opt !== 'custom') {
                                    setDurationError('');
                                }
                            }}
                            disabled={isLoading}
                        >
                            {opt === 'custom' ? 'Custom' : opt.toUpperCase()}
                        </button>
                    ))}
                    {durationOption === 'custom' && (
                        <input
                            type="number"
                            min={1}
                            max={90}
                            className={styles.customDaysInput}
                            placeholder="Days"
                            value={customDays}
                            onChange={(e) => {
                                setCustomDays(e.target.value);
                                if (!e.target.value.trim()) {
                                    setDurationError('Custom days are required when using Custom duration.');
                                    return;
                                }
                                const parsed = validateCustomDays(e.target.value);
                                setDurationError(parsed === null ? 'Custom days must be an integer between 1 and 90.' : '');
                            }}
                        />
                    )}
                    <button
                        className={styles.planBtn}
                        onClick={handleGeneratePlan}
                        disabled={!notes || isLoading || (durationOption === 'custom' && (!!durationError || !customDays.trim()))}
                    >
                        <i className="fas fa-calendar-check"></i> Generate Study Plan
                    </button>
                </div>

                {durationError && <p className={styles.inlineError}>{durationError}</p>}

                {error && (
                    <p className={styles.errorText}>{error}</p>
                )}
            </div>

            {/* Results */}
            <StudyNotes
                notes={notes}
                flashcards={flashcards}
                studyPlan={studyPlan}
                isLoading={isLoading}
                loadingText={loadingText}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                reviewQueueItem={reviewQueueItem}
                reviewMessage={reviewMessage}
                reviewLoading={reviewLoading}
                reviewSubmitting={reviewSubmitting}
                reviewProgressMap={reviewProgressMap}
                onLoadNextReview={handleLoadNextReview}
                onSubmitReview={handleSubmitReview}
            />
        </div>
    );
}
