import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { transferApi } from '../../chat/api/transferApi';
import StudyNotes from '../components/StudyNotes';
import HistoryPanel from '../components/HistoryPanel';
import Button from '../../../shared/components/Button/Button';
import Card from '../../../shared/components/Card/Card';
import styles from '../styles/studyNotes.module.css';
import s from '../../../styles/history.module.css';
import stepStyles from '../../../shared/styles/stepper.module.css';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import { useStudyNotesUpload } from '../hooks/useStudyNotesUpload';
import { useStudyNotesGenerate } from '../hooks/useStudyNotesGenerate';
import { useSpacedReview } from '../hooks/useSpacedReview';
import type { StudyPlanDurationOption } from '../api/studyNotesApi';

export default function StudyNotesPage() {
    const isEntranceActive = usePageEntrance();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');
    const [currentStep, setCurrentStep] = useState(1);

    const stepItems = [
        { step: 1, title: 'Upload & Configure', icon: 'fa-upload' },
        { step: 2, title: 'Notes & Flashcards', icon: 'fa-sticky-note' },
        { step: 3, title: 'Study Plan', icon: 'fa-calendar-check' },
    ];

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
        reviewError,
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
                const success = await generateFromFile(transferFile, transferStyle);
                if (success && !cancelled) {
                    setCurrentStep(2);
                }
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
        <div className={`container ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                title={<><i className="fas fa-book-reader" aria-hidden="true"></i> AI Study Notes Generator</>}
                subtitle="Upload lecture PDFs to generate structured notes and flashcards"
                className={styles.pageHeader}
                as="header"
                variant="workspace"
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
                <div className={stepStyles.stepperWrap} style={{ maxWidth: '900px' }}>
                    {stepItems.map((item) => {
                        const active = currentStep === item.step;
                        const done = currentStep > item.step;
                        const handleClick = () => {
                            if (!done) return;
                            setCurrentStep(item.step);
                            if (item.step === 2) {
                                setActiveTab(activeTab === 'plan' ? 'notes' : activeTab);
                            }
                            if (item.step === 3) setActiveTab('plan');
                        };

                        return (
                            <div
                                key={item.step}
                                className={`${stepStyles.stepperItem} ${active ? stepStyles.stepperItemActive : ''} ${done ? stepStyles.stepperItemDone : ''}`}
                                onClick={handleClick}
                            >
                                <div className={stepStyles.stepperCircle}>
                                    {done ? <i className="fas fa-check"></i> : <i className={`fas ${item.icon}`}></i>}
                                </div>
                                <div className={stepStyles.stepperLabel}>{item.title}</div>
                            </div>
                        );
                    })}
                </div>

                <div key={currentStep} style={{ animation: 'tabPopIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}>
                    {currentStep === 1 && (
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
                        <option value="deepseek">DeepSeek</option>
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
                                <Button
                                    className={styles.generateBtn}
                                    onClick={async () => {
                                        const success = await handleGenerate();
                                        if (success) {
                                            setCurrentStep(2);
                                        }
                                    }}
                                    disabled={!file || isLoading}
                                    variant="primary"
                                >
                                    {isLoading
                                        ? <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                                        : <><i className="fas fa-magic"></i> Generate Features</>}
                                </Button>
                            </div>
                            {error && <p className={styles.errorText}>{error}</p>}
                            {notes && (
                                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem' }}>
                                    <Button variant="primary" onClick={() => setCurrentStep(2)}>
                                        View Generated Notes <i className="fas fa-arrow-right" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className={styles.uploadCard} style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Study Material</h2>
                                <Button variant="primary" onClick={() => { setCurrentStep(3); setActiveTab('plan'); }}>
                                    Next: Build Study Plan <i className="fas fa-arrow-right" />
                                </Button>
                            </div>
                            <StudyNotes
                                notes={notes} flashcards={flashcards} studyPlan={null}
                                isLoading={isLoading} loadingText={loadingText}
                                activeTab={activeTab === 'plan' ? 'notes' : activeTab} setActiveTab={setActiveTab}
                                reviewQueueItem={null} reviewMessage={''} reviewError={''}
                                reviewLoading={false} reviewSubmitting={null}
                                reviewProgressMap={{}}
                                onLoadNextReview={async () => {}} onSubmitReview={async () => {}}
                            />
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className={styles.uploadCard} style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Create & Track Plan</h2>
                            </div>
                            <div className={styles.planControls} style={{ marginBottom: '2rem', padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
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
                                <Button
                                    variant="primary"
                                    onClick={handleGeneratePlan}
                                    disabled={!notes || isLoading || (durationOption === 'custom' && (!!durationError || !customDays.trim()))}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    <i className="fas fa-calendar-check"></i> Generate Plan
                                </Button>
                            </div>
                            {durationError && <p className={styles.inlineError}>{durationError}</p>}
                            {error && <p className={styles.errorText}>{error}</p>}
                            
                            <StudyNotes
                                notes={null} flashcards={[]} studyPlan={studyPlan}
                                isLoading={isLoading} loadingText={loadingText}
                                activeTab={'plan'} setActiveTab={() => {}}
                                reviewQueueItem={reviewQueueItem} reviewMessage={reviewMessage}
                                reviewError={reviewError}
                                reviewLoading={reviewLoading} reviewSubmitting={reviewSubmitting}
                                reviewProgressMap={reviewProgressMap}
                                onLoadNextReview={handleLoadNextReview} onSubmitReview={handleSubmitReview}
                            />
                        </div>
                    )}
                </div>
            </>}
        </div>
    );
}
