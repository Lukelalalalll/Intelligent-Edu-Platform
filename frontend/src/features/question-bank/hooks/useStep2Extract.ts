import { useState } from 'react';
import html2canvas from 'html2canvas';
import * as sub2Api from '../api/questionBankApi';
import { log } from '@/shared/utils/logger';
import type { SavedScreenshot, GenerationSource } from '../types';

interface UseStep2ExtractOptions {
    taskId: string | null;
    selectedPages: number[];
    setGenerationSource: (source: GenerationSource) => void;
    showToast: (msg: string, type: string) => void;
}

export function useStep2Extract({ taskId, selectedPages, setGenerationSource, showToast }: UseStep2ExtractOptions) {
    const [extractPrompt, setExtractPrompt] = useState('');
    const [extractLoading, setExtractLoading] = useState(false);
    const [exercises, setExercises] = useState<any[]>([]);
    const [rawExtractText, setRawExtractText] = useState('');
    const [selectedExercises, setSelectedExercises] = useState<number[]>([]);
    const [savedScreenshots, setSavedScreenshots] = useState<SavedScreenshot[]>([]);

    const hasExtractedResult = (exercises.length > 0) || Boolean(rawExtractText);

    const formatContent = (content: string) => content || '';

    const extractContent = async () => {
        if (exercises.length === 0 && selectedPages.length === 0) {
            // file_type != pdf — no page gate needed
        }
        setExtractLoading(true);
        setExercises([]);
        setRawExtractText('');
        try {
            const data = await sub2Api.extractQuestions({
                task_id: taskId,
                page_numbers: selectedPages,
                prompt: extractPrompt,
            });
            if (data.success) {
                if (data.data?.result?.llm_json?.exercises) {
                    const formattedEx = data.data.result.llm_json.exercises.map((ex: any) => ({
                        ...ex,
                        formattedText: formatContent(ex.text),
                    }));
                    setExercises(formattedEx);
                } else if (data.text) {
                    setRawExtractText(data.text);
                }
            } else {
                showToast(data.error, 'error');
            }
        } catch (error: any) {
            showToast('Extraction failed: ' + error.message, 'error');
        } finally {
            setExtractLoading(false);
        }
    };

    const captureElement = async (index: number, suppressAlert = false): Promise<boolean> => {
        const element = document.getElementById(`exercise-card-${index}`);
        if (!element) return false;

        const clone = element.cloneNode(true) as HTMLElement;
        document.body.appendChild(clone);
        clone.style.cssText = `position:absolute; left:-9999px; top:0; width:${element.offsetWidth}px; background:#fff; color:#000; z-index:9999;`;
        clone.querySelectorAll('button, input[type="checkbox"]').forEach(el => el.remove());

        try {
            const canvas = await html2canvas(clone, { backgroundColor: '#ffffff', useCORS: true, scale: 2 });
            const imgData = canvas.toDataURL('image/png');

            const res = await sub2Api.uploadScreenshot({
                image: imgData,
                chapter_number: (element as HTMLElement).dataset.chapter,
                sub_chapter_number: (element as HTMLElement).dataset.sub,
                exercise_number: (element as HTMLElement).dataset.q,
            });

            if (res.success) {
                setSavedScreenshots(prev =>
                    prev.some(s => s.filename === res.filename)
                        ? prev
                        : [...prev, { filename: res.filename, dataUrl: imgData }]
                );
                if (!suppressAlert) showToast(`Screenshot saved: ${res.filename}`, 'success');
                return true;
            } else {
                throw new Error(res.error);
            }
        } catch (err: any) {
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

    return {
        extractPrompt, setExtractPrompt,
        extractLoading,
        exercises, setExercises,
        rawExtractText, setRawExtractText,
        selectedExercises,
        savedScreenshots, setSavedScreenshots,
        hasExtractedResult,
        extractContent,
        takeSingleScreenshot: (i: number) => captureElement(i, false),
        takeBatchScreenshots,
        removeScreenshot: (filename: string) => setSavedScreenshots(prev => prev.filter(s => s.filename !== filename)),
        toggleExercise: (i: number) => setSelectedExercises(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]),
        toggleAllExercises: (checked: boolean) => setSelectedExercises(checked ? exercises.map((_, i) => i) : []),
        clearExerciseSelection: () => setSelectedExercises([]),
        updateExerciseText: (index: number, newText: string) =>
            setExercises(prev => prev.map((ex, i) => i === index ? { ...ex, text: newText } : ex)),
        deleteExercise: (index: number) => {
            setExercises(prev => prev.filter((_, i) => i !== index));
            setSelectedExercises(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
        },
    };
}
