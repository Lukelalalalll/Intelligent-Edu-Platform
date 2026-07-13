import { useState, useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import client from '@/shared/api/client';
import { log } from '@/shared/utils/logger';

type SpecifyFormState = {
    numOfBullets: number;
    wordsEachBullet: number;
    selectedTables: number[];
    generateTalkingScript: boolean;
    scriptStyle: string;
    presentationTitle: string;
    generateWordDocument: boolean;
};

export function useSpecify(navigate: NavigateFunction) {
    // --- State: Data ---
    const [highlightsData, setHighlightsData] = useState<any[]>([]);
    const [currentTables, setCurrentTables] = useState<any[]>([]);
    const [currentFilename, setCurrentFilename] = useState('');
    const [currentDisplayFilename, setCurrentDisplayFilename] = useState('');
    const [tablesBySection, setTablesBySection] = useState<Record<string, any[]>>({});

    // --- State: Form ---
    const [formState, setFormState] = useState<SpecifyFormState>({
        numOfBullets: 3,
        wordsEachBullet: 15,
        selectedTables: [],
        generateTalkingScript: false,
        scriptStyle: 'academic',
        presentationTitle: '',
        generateWordDocument: true,
    });

    // --- State: UI ---
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [results, setResults] = useState<any>(null);
    const [talkingScriptResult, setTalkingScriptResult] = useState<any>(null);
    const [generatedPptSchema, setGeneratedPptSchema] = useState<any>(null);

    // 1. Init data from localStorage
    useEffect(() => {
        const storedHighlights = JSON.parse(localStorage.getItem('highlightsData') || '[]');
        const storedTables = JSON.parse(localStorage.getItem('currentTables') || '[]');
        let storedFilename = localStorage.getItem('currentFilename') || '';
        let storedDisplayFilename = localStorage.getItem('currentDisplayFilename') || storedFilename;

        if (storedFilename.startsWith('"') && storedFilename.endsWith('"')) {
            storedFilename = storedFilename.slice(1, -1);
        }
        if (storedDisplayFilename.startsWith('"') && storedDisplayFilename.endsWith('"')) {
            storedDisplayFilename = storedDisplayFilename.slice(1, -1);
        }

        setHighlightsData(storedHighlights);
        setCurrentTables(storedTables);
        setCurrentFilename(storedFilename);
        setCurrentDisplayFilename(storedDisplayFilename);

        setFormState(prev => ({
            ...prev,
            presentationTitle: storedDisplayFilename ? storedDisplayFilename.replace(/\.[^/.]+$/, '') + ' - Script' : '',
        }));

        if (storedTables.length > 0 && storedHighlights.length > 0) {
            const selectedSections = new Set(storedHighlights.map((s: any) => s.sectionTitle));
            const grouped: Record<string, any[]> = {};
            storedTables.forEach((t: any) => {
                if (selectedSections.has(t.section_title)) {
                    if (!grouped[t.section_title]) grouped[t.section_title] = [];
                    grouped[t.section_title].push(t);
                }
            });
            setTablesBySection(grouped);
        }
    }, []);

    // 2. Table checkbox logic
    const handleCheckboxChange = (tableIndex: number) => {
        setFormState(prev => {
            const selected = prev.selectedTables;
            if (selected.includes(tableIndex)) {
                return { ...prev, selectedTables: selected.filter(id => id !== tableIndex) };
            } else {
                return { ...prev, selectedTables: [...selected, tableIndex] };
            }
        });
    };

    // 3. Build PPT schema from slide results
    const createPptSchema = (slideResults: any[]) => {
        const titleSource = currentDisplayFilename || currentFilename;
        const fileNameWithoutExt = titleSource ? titleSource.replace(/\.[^/.]+$/, '') : 'Presentation';
        const currentDate = new Date().toISOString().split('T')[0];

        const fullSelectedTables: any[] = [];
        formState.selectedTables.forEach(idx => {
            const tableData = currentTables.find(t => t.index === idx);
            if (tableData) fullSelectedTables.push(tableData);
        });

        const slidesWithTables = slideResults.map(slide => {
            const matchingTables = fullSelectedTables.filter(t => {
                const sTitle = slide.title.replace(/\s+/g, '');
                const tTitle = t.section_title.replace(/\s+/g, '');
                return sTitle.length > tTitle.length ? sTitle.includes(tTitle) : tTitle.includes(sTitle);
            });

            return {
                title: slide.title,
                content: slide.bullets || slide.content || [],
                slide_number: slide.slide_number || 0,
                latex: slide.latex || [],
                chart_type: slide.chart_type || '',
                chart_reasoning: slide.chart_reasoning || [],
                tables: matchingTables.map(t => ({ index: t.index, data: t.table })),
            };
        });

        return {
            presentation_title: fileNameWithoutExt,
            slides: slidesWithTables,
            metadata: { author: '', date: currentDate, description: '' },
        };
    };

    // 4. Form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        try {
            const sumRes = await client.post('/slides/summarize', {
                highlights: highlightsData,
                num_of_bullets: Number(formState.numOfBullets),
                words_each_bullet: Number(formState.wordsEachBullet),
            });

            const slideResults = sumRes.data.results;

            const pptSchema = createPptSchema(slideResults);
            setGeneratedPptSchema(pptSchema);
            localStorage.setItem('ppt_schema', JSON.stringify(pptSchema));

            if (formState.generateTalkingScript) {
                const scriptRes = await client.post('/slides/generate_talking_script', {
                    slides_results: slideResults,
                    script_style: formState.scriptStyle,
                    presentation_title: formState.presentationTitle,
                    generate_word: formState.generateWordDocument,
                });
                setTalkingScriptResult(scriptRes.data);
            }

            setResults(slideResults);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error: any) {
            setErrorMsg(error.response?.data?.message || error.message || 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    const handleProceed = () => {
        navigate('/slides/ppt-template', { state: { pptSchema: generatedPptSchema } });
    };

    const handleDownloadScript = async (e: React.MouseEvent, downloadUrl: string, filename: string) => {
        e.preventDefault();
        try {
            const response = await client.get(downloadUrl, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            log.error('sub1-specify', 'Download script failed', { message: error?.message });
            alert('Failed to download script. Please try again.');
        }
    };

    return {
        states: {
            highlightsData,
            tablesBySection,
            formState,
            loading,
            errorMsg,
            results,
            talkingScriptResult,
        },
        handlers: {
            setFormState,
            handleCheckboxChange,
            handleSubmit,
            handleProceed,
            handleDownloadScript,
        },
    };
}
