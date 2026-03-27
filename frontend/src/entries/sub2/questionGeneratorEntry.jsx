import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import client from '../../api/client';
import QuestionGeneratorPage from '../../pages/sub2/QuestionGenerator';
import { log } from '../../utils/logger';

export default function QuestionGeneratorEntry() {
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

    // --- Step 2 State ---
    const [extractPrompt, setExtractPrompt] = useState('exercise');
    const [apiType, setApiType] = useState('textin');
    const [extractLoading, setExtractLoading] = useState(false);
    const [exercises, setExercises] = useState([]);
    const [rawExtractText, setRawExtractText] = useState('');
    const [selectedExercises, setSelectedExercises] = useState([]);
    const [savedScreenshots, setSavedScreenshots] = useState([]);

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

    // --- Effect: Handle Question Type changes ---
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

    // --- Effect: Trigger MathJax after extract data changes ---
    useEffect(() => {
        if ((exercises.length > 0 || generatedQuestions) && window.MathJax) {
            // 当数据变化时，通知 MathJax 重新扫描页面把 $ 代码转成公式图形
            window.MathJax.typesetPromise().catch((err) => {
                log.warn('sub2', 'MathJax typeset failed', { message: err?.message });
            });
        }
    }, [exercises, generatedQuestions]); // 监听提取的题和生成的题

    // --- Format Helper ---
    const formatContent = (content) => {
        if (!content) return '<p>No content</p>';
        let cleaned = content.replace(/\*\*(\w+)\*\*/g, '$1').replace(/\\mathbf\{(\w+)\}/g, '$1');
        let formatted = cleaned.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
        formatted = formatted.replace(/\$\$(.*?)\$\$/g, '<span class="math">$$$$$1$$$$</span>');
        formatted = formatted.replace(/\$(.*?)\$/g, '<span class="math">$$$1$$</span>');
        return formatted;
    };

    // --- Upload Handlers ---
    const handleFile = async (selectedFile) => {
        if (!selectedFile) return;
        setCurrentStep(1);
        setFile(selectedFile);
        setUploadLoading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            // ⚠️ 注意：这里假设后端的 API 对应改为了 /sub2
            const res = await client.post('/sub2/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                setFileName(res.data.filename);
                setFileType(res.data.file_type);
                if (res.data.file_type === 'pdf') {
                    setTotalPages(res.data.total_pages);
                    setSelectedPages([]);
                }
            } else {
                alert(res.data.error);
            }
        } catch (err) {
            alert('Upload failed: ' + err.message);
        } finally {
            setUploadLoading(false);
        }
    };

    // --- Extract Handlers ---
    const extractContent = async () => {
        if (fileType === 'pdf' && selectedPages.length === 0) { alert('Please select at least one page'); return; }
        setExtractLoading(true); setExercises([]); setRawExtractText('');
        try {
            const res = await client.post('/sub2/extract_questions', {
                api_type: apiType, page_numbers: selectedPages, prompt: extractPrompt
            });
            if (res.data.success) {
                if (res.data.data?.result?.llm_json?.exercises) {
                    const formattedEx = res.data.data.result.llm_json.exercises.map(ex => ({ ...ex, formattedText: formatContent(ex.text) }));
                    setExercises(formattedEx);
                } else if (res.data.text) {
                    setRawExtractText(res.data.text);
                }
            } else { alert(res.data.error); }
        } catch (error) { alert('Extraction failed: ' + error.message); }
        finally { setExtractLoading(false); }
    };

    // --- Screenshot Handlers ---
    const captureElement = async (index, suppressAlert = false) => {
        const element = document.getElementById(`exercise-card-${index}`);
        if (!element) return;

        const clone = element.cloneNode(true);
        document.body.appendChild(clone);
        clone.style.cssText = 'position:absolute; left:-9999px; top:0; width:' + element.offsetWidth + 'px; background:#fff; color:#000; z-index:9999;';
        clone.querySelectorAll('button, input[type="checkbox"]').forEach(el => el.remove());

        try {
            const canvas = await html2canvas(clone, { backgroundColor: '#ffffff', useCORS: true, scale: 2 });
            document.body.removeChild(clone);
            const imgData = canvas.toDataURL('image/png');

            const res = await client.post('/sub2/upload_screenshot', {
                image: imgData,
                chapter_number: element.dataset.chapter,
                sub_chapter_number: element.dataset.sub,
                exercise_number: element.dataset.q
            });

            if (res.data.success) {
                setSavedScreenshots(prev => (prev.includes(res.data.filename) ? prev : [...prev, res.data.filename]));
                if (!suppressAlert) alert(`Screenshot saved: ${res.data.filename}`);
            } else { throw new Error(res.data.error); }
        } catch (err) {
            if (!suppressAlert) alert('Failed: ' + err.message);
        }
    };

    const takeBatchScreenshots = async () => {
        if (selectedExercises.length === 0) { alert('Please select exercises first.'); return; }
        for (const idx of selectedExercises) { await captureElement(idx, true); }
        alert(`Batch processing complete. Images saved.`);
    };

    // --- Generate & Export ---
    const generateQuestions = async () => {
        if (questionBasis === 'example_images' && savedScreenshots.length === 0) {
            alert('Please capture at least one screenshot before using Example images basis.');
            return;
        }

        const parsedCount = parseInt(String(numQuestions), 10);
        const safeNumQuestions = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 5;
        const parsedDifficulty = parseInt(String(difficulty), 10);
        const safeDifficulty = Number.isFinite(parsedDifficulty) && parsedDifficulty > 0 ? parsedDifficulty : 3;
        const safeConstraints = String(constraints || '')
            .split('\n')
            .map((c) => c.trim())
            .filter(Boolean);

        const payload = {
            subject: String(subject || 'Mathematics').trim() || 'Mathematics',
            question_type: String(questionType || 'Multiple choice').trim() || 'Multiple choice',
            num_questions: safeNumQuestions,
            difficulty: safeDifficulty,
            constraints: safeConstraints,
            output_language: String(outputLanguage || 'Chinese').trim() || 'Chinese',
            question_basis: questionBasis || null,
            knowledge_points: String(knowledgePoints || ''),
            saved_screenshots: Array.isArray(savedScreenshots) ? savedScreenshots.filter(Boolean) : [],
        };

        setGenerateLoading(true); setGeneratedQuestions(null);
        try {
            const res = await client.post('/sub2/generate_questions', payload);
            if (res.data.success) {
                setGeneratedQuestions(res.data.questions.replace(/\n/g, '<br>'));
            } else { alert(res.data.error); }
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
            alert('Generation error: ' + (detailText || err.message));
        }
        finally { setGenerateLoading(false); }
    };

    const exportQuestions = async (format) => {
        try {
            const res = await client.post('/sub2/export_questions', { format }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(res.data);
            const a = document.createElement('a'); a.href = url;
            a.download = `questions.${format === 'word' ? 'docx' : 'pptx'}`;
            a.click(); window.URL.revokeObjectURL(url);
        } catch { alert('Export failed'); }
    };

    const goToStep1 = () => setCurrentStep(1);
    const goToStep2 = () => {
        if (canEnterStep2) setCurrentStep(2);
    };
    const goToStep3 = () => {
        if (canEnterStep3) setCurrentStep(3);
    };

    // --- Bundle States & Handlers ---
    const states = { currentStep, file, fileName, fileType, totalPages, selectedPages, uploadLoading, extractPrompt, apiType, extractLoading, exercises, selectedExercises, rawExtractText, subject, questionType, numQuestions, difficulty, constraints, outputLanguage, questionBasis, knowledgePoints, savedScreenshots, generateLoading, generatedQuestions, isDragging };
    const handlers = {
        setExtractPrompt, setApiType, setSubject, setQuestionType, setNumQuestions, setDifficulty, setConstraints, setOutputLanguage, setQuestionBasis, setKnowledgePoints,
        goToStep1,
        goToStep2,
        goToStep3,
        handleFileChange: e => handleFile(e.target.files[0]),
        handleDragOver: e => { e.preventDefault(); setIsDragging(true); },
        handleDragLeave: () => setIsDragging(false),
        handleDrop: e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); },
        togglePage: i => setSelectedPages(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i].sort((a, b) => a - b)),
        selectAllPages: () => setSelectedPages(Array.from({ length: totalPages }, (_, i) => i)),
        clearPageSelection: () => setSelectedPages([]),
        extractContent,
        toggleExercise: i => setSelectedExercises(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]),
        toggleAllExercises: checked => setSelectedExercises(checked ? exercises.map((_, i) => i) : []),
        clearExerciseSelection: () => setSelectedExercises([]),
        takeSingleScreenshot: i => captureElement(i, false),
        takeBatchScreenshots, generateQuestions, exportQuestions
    };

    return <QuestionGeneratorPage states={states} handlers={handlers} />;
}