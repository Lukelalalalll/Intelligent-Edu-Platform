import { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import * as sub2Api from '../../../api/questionBankApi';
import { useToast } from '../../../hooks/useToast';
import { log } from '../../../utils/logger';

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

    // --- Step 2 State ---
    const [extractPrompt, setExtractPrompt] = useState('exercise');
    const [extractLoading, setExtractLoading] = useState(false);
    const [exercises, setExercises] = useState([]);
    const [rawExtractText, setRawExtractText] = useState('');
    const [selectedExercises, setSelectedExercises] = useState([]);
    const [savedScreenshots, setSavedScreenshots] = useState<Array<{filename: string; dataUrl: string}>>([]);

    // --- Step 3 State ---
    const [subject, setSubject] = useState('Mathematics');
    const [questionType, setQuestionType] = useState('Multiple choice');
    const [numQuestions, setNumQuestions] = useState(5);
    const [difficulty, setDifficulty] = useState(3);
    const [constraints, setConstraints] = useState('');
    const [outputLanguage, setOutputLanguage] = useState('Chinese');
    const [questionBasis, setQuestionBasis] = useState('');
    const [knowledgePoints, setKnowledgePoints] = useState('');
    const [generateLoading, setGenerateLoading] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState(null);

    const canEnterStep2 = Boolean(file) && (fileType !== 'pdf' || selectedPages.length > 0);
    const canEnterStep3 = (Array.isArray(exercises) && exercises.length > 0) || Boolean(rawExtractText);

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
        if (!element) return;

        const clone = element.cloneNode(true) as HTMLElement;
        document.body.appendChild(clone);
        clone.style.cssText = 'position:absolute; left:-9999px; top:0; width:' + element.offsetWidth + 'px; background:#fff; color:#000; z-index:9999;';
        clone.querySelectorAll('button, input[type="checkbox"]').forEach(el => el.remove());

        try {
            const canvas = await html2canvas(clone as HTMLElement, { backgroundColor: '#ffffff', useCORS: true, scale: 2 });
            document.body.removeChild(clone as HTMLElement);
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
            } else { throw new Error(res.error); }
        } catch (err) {
            if (!suppressAlert) showToast('Failed: ' + err.message, 'error');
        }
    };

    const takeBatchScreenshots = async () => {
        if (selectedExercises.length === 0) { showToast('Please select exercises first.', 'warning'); return; }
        for (const idx of selectedExercises) { await captureElement(idx, true); }
        showToast('Batch processing complete. Images saved.', 'success');
    };

    const generateQuestions = async () => {
        if (questionBasis === 'example_images' && savedScreenshots.length === 0) {
            showToast('Please capture at least one screenshot before using Example images basis.', 'warning');
            return;
        }

        const parsedCount = parseInt(String(numQuestions), 10);
        const safeNumQuestions = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 5;
        const parsedDifficulty = parseInt(String(difficulty), 10);
        const safeDifficulty = Number.isFinite(parsedDifficulty) && parsedDifficulty > 0 ? parsedDifficulty : 3;
        const safeConstraints = String(constraints || '')
            .split('\n').map((c) => c.trim()).filter(Boolean);

        const payload = {
            task_id: taskId,
            subject: String(subject || 'Mathematics').trim() || 'Mathematics',
            question_type: String(questionType || 'Multiple choice').trim() || 'Multiple choice',
            num_questions: safeNumQuestions,
            difficulty: safeDifficulty,
            constraints: safeConstraints,
            output_language: String(outputLanguage || 'Chinese').trim() || 'Chinese',
            question_basis: questionBasis || null,
            knowledge_points: String(knowledgePoints || ''),
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
        subject, questionType, numQuestions, difficulty, constraints, outputLanguage,
        questionBasis, knowledgePoints, savedScreenshots, generateLoading, generatedQuestions, isDragging,
    };

    const handlers = {
        setExtractPrompt, setSubject, setQuestionType, setNumQuestions, setDifficulty,
        setConstraints, setOutputLanguage, setQuestionBasis, setKnowledgePoints,
        goToStep1: () => setCurrentStep(1),
        goToStep2: () => { if (canEnterStep2) setCurrentStep(2); },
        goToStep3: () => { if (canEnterStep3) setCurrentStep(3); },
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
    };

    return { states, handlers, toasts, removeToast };
}
