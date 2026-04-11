import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { transferApi } from '../../chat/api/transferApi';
import StudyNotes from '../StudyNotes';
import HistoryPanel from '../components/HistoryPanel';
import Button from '../../../shared/components/Button/Button';
import Card from '../../../shared/components/Card/Card';
import styles from '../styles/studyNotes.module.css';
import s from '../../../styles/history.module.css';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import { useStudyNotesUpload } from '../hooks/useStudyNotesUpload';
import { useStudyNotesGenerate } from '../hooks/useStudyNotesGenerate';
import { useSpacedReview } from '../hooks/useSpacedReview';
import type { StudyPlanDurationOption } from '../api/studyNotesApi';

export default function StudyNotesPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');

    const { file, setFile, isDragging, fileInputRef, handleDragOver, handleDragLeave, handleDrop, handleFileInput } =
        useStudyNotesUpload();

    const {
        style, setStyle,
        notes,
        flashcards,
        isLoading, setIsLoading,
        loadingText, setLoadingText,
        error, setError,
        activeTab, setActiveTab,
        provider, setProvider,
        generateFromFile,
        handleGenerate,
    } = useStudyNotesGenerate(file);

    const {
        studyPlan,
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
    } = useSpacedReview({ notes, flashcards, file, setError, setIsLoading, setLoadingText, setActiveTab });

    // Transfer ticket auto-consumption (orchestrates across upload + generate hooks)
    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId) return;
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            setLoadingText('Receiving file from chat...');
            setError('');
            try {
                const { file: transferFile, meta } = await transferApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;
                setFile(transferFile);
                const transferStyle = (meta.target_options?.style && typeof meta.target_options.style === 'string')
                    ? meta.target_options.style : style;
                if (transferStyle !== style) setStyle(transferStyle);
                searchParams.delete('transfer_id');
                setSearchParams(searchParams, { replace: true });
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

    return (
        <div className="container">
            <WelcomeBanner
                title={<><i className="fas fa-book-reader" aria-hidden="true"></i> AI Study Notes Generator</>}
                subtitle="Upload lecture PDFs to generate structured notes and flashcards"
                className={styles.pageHeader}
                as="header"
            />
            <div className={s.viewSwitch}>
                <Button type="button" variant={activeView === 'workflow' ? 'primary' : 'outline'} onClick={() => setActiveView('workflow')}>
                    <i className="fas fa-book" /> Workflow
                </Button>
                <Button type="button" variant={activeView === 'history' ? 'primary' : 'outline'} onClick={() => setActiveView('history')}>
                    <i className="fas fa-history" /> History
                </Button>
            </div>
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel onReplay={() => setActiveView('workflow')} />
                </Card>
            )}
            {activeView === 'workflow' && <>
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
                    <select value={provider} onChange={(e) => setProvider(e.target.value as Parameters<typeof setProvider>[0])}>
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
                    <button className={styles.generateBtn} onClick={handleGenerate} disabled={!file || isLoading}>
                        {isLoading
                            ? <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                            : <><i className="fas fa-magic"></i> Generate</>}
                    </button>
                </div>
                <div className={styles.planControls}>
                    <span className={styles.planLabel}>Plan Duration:</span>
                    {(['3d', '7d', '14d', 'custom'] as StudyPlanDurationOption[]).map((opt) => (
                        <button
                            key={opt}
                            className={`${styles.durationBtn} ${durationOption === opt ? styles.durationBtnActive : ''}`}
                            onClick={() => { setDurationOption(opt); if (opt !== 'custom') setDurationError(''); }}
                            disabled={isLoading}
                        >
                            {opt === 'custom' ? 'Custom' : opt.toUpperCase()}
                        </button>
                    ))}
                    {durationOption === 'custom' && (
                        <input
                            type="number" min={1} max={90}
                            className={styles.customDaysInput} placeholder="Days"
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
                        className={styles.planBtn} onClick={handleGeneratePlan}
                        disabled={!notes || isLoading || (durationOption === 'custom' && (!!durationError || !customDays.trim()))}
                    >
                        <i className="fas fa-calendar-check"></i> Generate Study Plan
                    </button>
                </div>
                {durationError && <p className={styles.inlineError}>{durationError}</p>}
                {error && <p className={styles.errorText}>{error}</p>}
            </div>
            <StudyNotes
                notes={notes} flashcards={flashcards} studyPlan={studyPlan}
                isLoading={isLoading} loadingText={loadingText}
                activeTab={activeTab} setActiveTab={setActiveTab}
                reviewQueueItem={reviewQueueItem} reviewMessage={reviewMessage}
                reviewLoading={reviewLoading} reviewSubmitting={reviewSubmitting}
                reviewProgressMap={reviewProgressMap}
                onLoadNextReview={handleLoadNextReview} onSubmitReview={handleSubmitReview}
            />
            </>}
        </div>
    );
}
