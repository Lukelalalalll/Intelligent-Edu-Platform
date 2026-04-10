import { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import * as sub2Api from '../../../api/questionBankApi';
import { questionOpsApi } from '../../../api/questionOpsApi';
import { useToast } from '../../../hooks/useToast';
import { log } from '../../../utils/logger';
import { getStoredAIProvider, setStoredAIProvider, type AIProvider } from '../../../shared/aiProvider';

export function useQuestionGenerator() {
    const { toasts, showToast, removeToast } = useToast();

    const [currentStep, setCurrentStep] = useState(() => {
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('sub2_current_step') : null;
        const parsed = Number(saved);
        return [1, 2, 3].includes(parsed) ? parsed : 1;
    });

    // --- Step 1 State ---
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [fileType, setFileType] = useState('');
    const [totalPages, setTotalPages] = useState(0);
    const [selectedPages, setSelectedPages] = useState([]);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [taskId, setTaskId] = useState(null);
    const [generationMode, setGenerationMode] = useState<'pdf_direct' | 'extract_first'>('extract_first');
    const [generationSource, setGenerationSource] = useState<'pdf' | 'screenshot_set'>('pdf');

    // --- Step 2 State ---
    const [extractPrompt, setExtractPrompt] = useState('');
    const [extractLoading, setExtractLoading] = useState(false);
    const [exercises, setExercises] = useState([]);
    const [rawExtractText, setRawExtractText] = useState('');
    const [selectedExercises, setSelectedExercises] = useState([]);
    const [savedScreenshots, setSavedScreenshots] = useState<Array<{filename: string; dataUrl: string}>>([]);

    // --- Step 3 State ---
    const [questionType, setQuestionType] = useState('Multiple choice');
    const [numQuestions, setNumQuestions] = useState(5);
    const [difficulty, setDifficulty] = useState(3);
    const [constraints, setConstraints] = useState('');
    const [constraintSuggestions, setConstraintSuggestions] = useState<string[]>([]);
    const [isSuggestingConstraints, setIsSuggestingConstraints] = useState(false);
    const [outputLanguage, setOutputLanguage] = useState('English');
    const [generateLoading, setGenerateLoading] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState(null);
    const [provider, setProvider] = useState<AIProvider>(() => getStoredAIProvider());

    // --- QuestionOps State ---
    const [questionOpsRunId, setQuestionOpsRunId] = useState('');
    const [questionOpsSummary, setQuestionOpsSummary] = useState<any>(null);
    const [questionOpsItems, setQuestionOpsItems] = useState<any[]>([]);
    const [questionOpsLoading, setQuestionOpsLoading] = useState(false);
    const [questionOpsError, setQuestionOpsError] = useState('');
    const [questionOpsThreshold, setQuestionOpsThreshold] = useState('0.82');
    const [questionOpsSort, setQuestionOpsSort] = useState<'quality_desc' | 'quality_asc'>('quality_desc');
    const [questionOpsDuplicatesOnly, setQuestionOpsDuplicatesOnly] = useState(false);
    const [questionOpsTagFilter, setQuestionOpsTagFilter] = useState('all');
    const [questionOpsDedupeResult, setQuestionOpsDedupeResult] = useState<{ kept: number; removed: number } | null>(null);
    const [questionOpsDedupeLoading, setQuestionOpsDedupeLoading] = useState(false);

    useEffect(() => {
        setStoredAIProvider(provider);
    }, [provider]);

    const canEnterStep2 = Boolean(file);
    const hasExtractedResult = (Array.isArray(exercises) && exercises.length > 0) || Boolean(rawExtractText);
    const canEnterStep3 = generationMode === 'pdf_direct' ? Boolean(file) : hasExtractedResult;

    useEffect(() => {
        if (questionType === 'Quiz') setNumQuestions(10);
        else if (questionType === 'Exam Paper') setNumQuestions(15);
    }, [questionType]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('sub2_current_step', String(currentStep));
        }
    }, [currentStep]);

    useEffect(() => {
        if (currentStep === 3 && !canEnterStep3) {
            setCurrentStep(canEnterStep2 ? 2 : 1);
        } else if (currentStep === 2 && !canEnterStep2) {
            setCurrentStep(1);
        }
    }, [currentStep, canEnterStep2, canEnterStep3]);

    useEffect(() => {
        if ((exercises.length > 0 || generatedQuestions) && window.MathJax) {
            window.MathJax.typesetPromise().catch((err) => {
                log.warn('sub2', 'MathJax typeset failed', { message: err?.message });
            });
        }
    }, [exercises, generatedQuestions]);

    const formatContent = (content) => content || '';

    const handleFile = async (selectedFile) => {
        if (!selectedFile) return;
        setCurrentStep(1);
        setFile(selectedFile);
        setGenerationSource('pdf');
        setUploadLoading(true);
        try {
            const data = await sub2Api.uploadFile(selectedFile);
            if (data.success) {
                setFileName(data.filename);
                setFileType(data.file_type);
                setTaskId(data.task_id);
                if (data.file_type === 'pdf') {
                    setTotalPages(data.total_pages);
                    setSelectedPages([]);
                }
            } else {
                showToast(data.error, 'error');
            }
        } catch (err) {
            showToast('Upload failed: ' + err.message, 'error');
        } finally {
            setUploadLoading(false);
        }
    };

    const replayFromHistory = async (historyItem) => {
        if (!historyItem?.id) {
            showToast('Replay failed: invalid history item.', 'error');
            return;
        }

        const params = historyItem.params || {};
        if (params.question_type) setQuestionType(params.question_type);
        if (params.num_questions) setNumQuestions(params.num_questions);
        if (params.difficulty) setDifficulty(params.difficulty);
        if (Array.isArray(params.constraints)) setConstraints(params.constraints.join('\n'));
        if (params.output_language) setOutputLanguage(params.output_language);
        if (params.source_type) setGenerationSource(params.source_type);

        try {
            setUploadLoading(true);
            const data = await sub2Api.replayGenerationHistory(historyItem.id);
            if (!data?.success || !data?.task_id) {
                showToast(data?.error || 'Replay failed: could not restore source file.', 'error');
                return;
            }

            // Restore upload/task context so Step1 and Step3 can reuse the original source file.
            setFile({ name: data.filename || 'history-source.pdf' } as any);
            setFileName(data.filename || 'history-source.pdf');
            setFileType(data.file_type || 'pdf');
            setTaskId(data.task_id);
            setTotalPages(Number(data.total_pages || 0));
            setSelectedPages(Array.isArray(data.page_numbers) ? data.page_numbers : []);

            const replaySourceType = data.source_type || params.source_type || 'pdf';
            setGenerationSource(replaySourceType);
            if (replaySourceType === 'pdf') {
                setGenerationMode('pdf_direct');
            }

            setCurrentStep(1);
            showToast('Replay ready: source PDF restored to Upload step.', 'success');
        } catch (err) {
            showToast('Replay failed: ' + (err?.message || 'unknown error'), 'error');
        } finally {
            setUploadLoading(false);
        }
    };

    const selectGenerationMode = (mode: 'pdf_direct' | 'extract_first') => {
        setGenerationMode(mode);
        if (mode === 'pdf_direct') {
            setGenerationSource('pdf');
        }
    };

    const extractContent = async () => {
        if (fileType === 'pdf' && selectedPages.length === 0) { showToast('Please select at least one page', 'warning'); return; }
        setExtractLoading(true); setExercises([]); setRawExtractText('');
        try {
            const data = await sub2Api.extractQuestions({
                task_id: taskId, page_numbers: selectedPages, prompt: extractPrompt
            });
            if (data.success) {
                if (data.data?.result?.llm_json?.exercises) {
                    const formattedEx = data.data.result.llm_json.exercises.map(ex => ({ ...ex, formattedText: formatContent(ex.text) }));
                    setExercises(formattedEx);
                } else if (data.text) {
                    setRawExtractText(data.text);
                }
            } else { showToast(data.error, 'error'); }
        } catch (error) { showToast('Extraction failed: ' + error.message, 'error'); }
        finally { setExtractLoading(false); }
    };

    const captureElement = async (index, suppressAlert = false) => {
        const element = document.getElementById(`exercise-card-${index}`);
        if (!element) return false;

        const clone = element.cloneNode(true) as HTMLElement;
        document.body.appendChild(clone);
        clone.style.cssText = 'position:absolute; left:-9999px; top:0; width:' + element.offsetWidth + 'px; background:#fff; color:#000; z-index:9999;';
        clone.querySelectorAll('button, input[type="checkbox"]').forEach(el => el.remove());

        try {
            const canvas = await html2canvas(clone as HTMLElement, { backgroundColor: '#ffffff', useCORS: true, scale: 2 });
            const imgData = canvas.toDataURL('image/png');

            const res = await sub2Api.uploadScreenshot({
                image: imgData,
                chapter_number: element.dataset.chapter,
                sub_chapter_number: element.dataset.sub,
                exercise_number: element.dataset.q,
            });

            if (res.success) {
                setSavedScreenshots(prev => (prev.some(s => s.filename === res.filename) ? prev : [...prev, { filename: res.filename, dataUrl: imgData }]));
                if (!suppressAlert) showToast(`Screenshot saved: ${res.filename}`, 'success');
                return true;
            } else { throw new Error(res.error); }
        } catch (err) {
            if (!suppressAlert) showToast('Failed: ' + err.message, 'error');
            return false;
        } finally {
            if (document.body.contains(clone)) {
                document.body.removeChild(clone);
            }
        }
    };

    const takeBatchScreenshots = async () => {
        if (selectedExercises.length === 0) {
            showToast('Please select at least one exercise to curate a visual reference set.', 'warning');
            return;
        }
        let savedCount = 0;
        for (const idx of selectedExercises) {
            const ok = await captureElement(idx, true);
            if (ok) savedCount += 1;
        }
        if (savedCount === 0) {
            showToast('No screenshots were saved. Please try again.', 'error');
            return;
        }
        setGenerationSource('screenshot_set');
        showToast(`Visual reference set curated. ${savedCount} new image${savedCount === 1 ? '' : 's'} ready for next-step generation.`, 'success');
    };

    const generateQuestions = async () => {
        if (generationSource === 'screenshot_set' && savedScreenshots.length === 0) {
            showToast('Visual reference set is empty. Curate screenshots first or switch source to PDF Content.', 'warning');
            return;
        }

        const parsedCount = parseInt(String(numQuestions), 10);
        const safeNumQuestions = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 5;
        const parsedDifficulty = parseInt(String(difficulty), 10);
        const safeDifficulty = Number.isFinite(parsedDifficulty) && parsedDifficulty > 0 ? parsedDifficulty : 3;
        const safeConstraints = String(constraints || '')
            .split('\n').map((c) => c.trim()).filter(Boolean);

        const payload = {
            provider,
            task_id: taskId,
            question_type: String(questionType || 'Multiple choice').trim() || 'Multiple choice',
            num_questions: safeNumQuestions,
            difficulty: safeDifficulty,
            constraints: safeConstraints,
            output_language: String(outputLanguage || 'English').trim() || 'English',
            source_type: generationSource,
            page_numbers: selectedPages,
            saved_screenshots: Array.isArray(savedScreenshots) ? savedScreenshots.map(s => s.filename).filter(Boolean) : [],
        };

        setGenerateLoading(true); setGeneratedQuestions(null);
        try {
            const data = await sub2Api.generateQuestions(payload);
            if (data.success) {
                setGeneratedQuestions(data.questions);
            } else { showToast(data.error, 'error'); }
        } catch (err) {
            const detail = err?.response?.data?.detail;
            let detailText = '';
            if (Array.isArray(detail)) {
                detailText = detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
            } else if (typeof detail === 'string') {
                detailText = detail;
            } else if (err?.response?.data?.error) {
                detailText = String(err.response.data.error);
            }
            showToast('Generation error: ' + (detailText || err.message), 'error');
        } finally { setGenerateLoading(false); }
    };

    const suggestConstraintHints = async () => {
        if (!taskId) {
            showToast('Please complete Step 1 upload first.', 'warning');
            return;
        }

        setIsSuggestingConstraints(true);
        try {
            const payload = {
                provider,
                task_id: taskId,
                source_type: generationSource,
                page_numbers: selectedPages,
                question_type: String(questionType || 'Multiple choice').trim() || 'Multiple choice',
                num_questions: Number.parseInt(String(numQuestions), 10) || 5,
                difficulty: Number.parseInt(String(difficulty), 10) || 3,
                output_language: String(outputLanguage || 'English').trim() || 'English',
            };
            const data = await sub2Api.suggestConstraints(payload);
            if (data.success) {
                setConstraintSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
            } else {
                showToast(data.error || 'Failed to generate suggestions', 'error');
            }
        } catch (err: any) {
            showToast('Suggestion failed: ' + (err?.message || 'unknown error'), 'error');
        } finally {
            setIsSuggestingConstraints(false);
        }
    };

    const runQuestionOps = async () => {
        if (questionOpsLoading) {
            return;
        }

        const sourceText = typeof generatedQuestions === 'string' ? generatedQuestions : rawExtractText;
        const thresholdNum = Number.parseFloat(questionOpsThreshold);
        const safeThreshold = Number.isFinite(thresholdNum) ? thresholdNum : 0.82;

        setQuestionOpsLoading(true);
        setQuestionOpsError('');
        setQuestionOpsDedupeResult(null);
        try {
            const run = await questionOpsApi.createRun({
                task_id: taskId,
                source_text: sourceText || undefined,
                dedupe_threshold: safeThreshold,
            });

            const runId = run.run_id;
            setQuestionOpsRunId(runId);
            setQuestionOpsSummary(run.summary || null);

            const itemRes = await questionOpsApi.getItems(runId);
            setQuestionOpsItems(itemRes.items || []);

            showToast('QuestionOps analysis completed.', 'success');
        } catch (err) {
            const detail = err?.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : 'Failed to run QuestionOps analysis';
            setQuestionOpsError(msg);
            showToast(msg, 'error');
        } finally {
            setQuestionOpsLoading(false);
        }
    };

    const applyQuestionOpsDedupe = async () => {
        if (!questionOpsRunId || questionOpsDedupeLoading) {
            return;
        }

        const thresholdNum = Number.parseFloat(questionOpsThreshold);
        if (!Number.isFinite(thresholdNum) || thresholdNum < 0 || thresholdNum > 1) {
            const msg = 'Threshold must be between 0.00 and 1.00.';
            setQuestionOpsError(msg);
            showToast(msg, 'warning');
            return;
        }

        setQuestionOpsDedupeLoading(true);
        setQuestionOpsError('');
        try {
            const dedupeRes = await questionOpsApi.applyDedupe(questionOpsRunId, {
                dedupe_threshold: thresholdNum,
            });
            setQuestionOpsDedupeResult({ kept: dedupeRes.kept, removed: dedupeRes.removed });

            const [runRes, itemRes] = await Promise.all([
                questionOpsApi.getRun(questionOpsRunId),
                questionOpsApi.getItems(questionOpsRunId),
            ]);
            setQuestionOpsSummary(runRes.run?.summary || null);
            setQuestionOpsItems(itemRes.items || []);
            showToast(`Dedupe complete. Kept ${dedupeRes.kept}, removed ${dedupeRes.removed}.`, 'success');
        } catch (err) {
            const detail = err?.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : 'Failed to apply dedupe';
            setQuestionOpsError(msg);
            showToast(msg, 'error');
        } finally {
            setQuestionOpsDedupeLoading(false);
        }
    };

    const exportQuestions = async () => {
        try {
            const blob = await sub2Api.exportQuestions(taskId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = 'questions.md';
            a.click(); window.URL.revokeObjectURL(url);
        } catch { showToast('Export failed', 'error'); }
    };

    const states = {
        currentStep, file, fileName, fileType, totalPages, selectedPages, uploadLoading,
        extractPrompt, extractLoading, exercises, selectedExercises, rawExtractText,
        questionType, numQuestions, difficulty, constraints, outputLanguage,
        constraintSuggestions, isSuggestingConstraints,
        savedScreenshots, generateLoading, generatedQuestions, isDragging, provider,
        generationMode, generationSource, hasExtractedResult,
        questionOpsRunId, questionOpsSummary, questionOpsItems, questionOpsLoading, questionOpsError,
        questionOpsThreshold, questionOpsSort, questionOpsDuplicatesOnly, questionOpsTagFilter,
        questionOpsDedupeResult, questionOpsDedupeLoading,
    };

    const handlers = {
        setExtractPrompt, setQuestionType, setNumQuestions, setDifficulty,
        setConstraints, setOutputLanguage, setGenerationSource,
        onSuggestConstraints: suggestConstraintHints,
        setGenerationMode: selectGenerationMode,
        setProvider,
        setQuestionOpsThreshold,
        setQuestionOpsSort,
        setQuestionOpsDuplicatesOnly,
        setQuestionOpsTagFilter,
        goToStep1: () => setCurrentStep(1),
        goToStep2: () => { if (canEnterStep2) setCurrentStep(2); },
        goToStep3: () => {
            if (!canEnterStep3) return;
            if (generationMode === 'pdf_direct') {
                setGenerationSource('pdf');
            }
            setCurrentStep(3);
        },
        handleFileChange: (e) => handleFile(e.target.files[0]),
        handleDragOver: (e) => { e.preventDefault(); setIsDragging(true); },
        handleDragLeave: () => setIsDragging(false),
        handleDrop: (e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); },
        togglePage: (i) => setSelectedPages(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i].sort((a, b) => a - b)),
        selectAllPages: () => setSelectedPages(Array.from({ length: totalPages }, (_, i) => i)),
        clearPageSelection: () => setSelectedPages([]),
        extractContent,
        toggleExercise: (i) => setSelectedExercises(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]),
        toggleAllExercises: (checked) => setSelectedExercises(checked ? exercises.map((_, i) => i) : []),
        clearExerciseSelection: () => setSelectedExercises([]),
        updateExerciseText: (index, newText) => setExercises(prev => prev.map((ex, i) => i === index ? { ...ex, text: newText } : ex)),
        deleteExercise: (index) => {
            setExercises(prev => prev.filter((_, i) => i !== index));
            setSelectedExercises(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
        },
        takeSingleScreenshot: (i) => captureElement(i, false),
        takeBatchScreenshots,
        removeScreenshot: (filename: string) => setSavedScreenshots(prev => prev.filter(s => s.filename !== filename)),
        generateQuestions,
        exportQuestions,
        runQuestionOps,
        applyQuestionOpsDedupe,
        replayFromHistory,
    };

    return { states, handlers, toasts, removeToast };
}
