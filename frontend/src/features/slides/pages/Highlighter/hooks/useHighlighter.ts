import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import client from '@/shared/api/client';
import { log } from '@/shared/utils/logger';

type Section = { title: string; content: string };
type Highlight = { id: string; text: string; sectionTitle: string; category?: string; confidence?: number; reason?: string };

export function useHighlighter() {
    const navigate = useNavigate();
    const markdownViewRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);
    const [, setErrorMsg] = useState('');
    const [statusMsg, setStatusMsg] = useState('');

    const [currentFilename, setCurrentFilename] = useState('');
    const [sections, setSections] = useState<Section[]>([]);
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [isRenderedView, setIsRenderedView] = useState(true);
    const [htmlContent, setHtmlContent] = useState('');

    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [classifying, setClassifying] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');

    useEffect(() => {
        const fetchFile = async () => {
            const combinedFilename = localStorage.getItem('combinedFilename');
            if (!combinedFilename) {
                setErrorMsg('No combined file found.');
                setLoading(false);
                return;
            }

            try {
                const [mdResponse, hlResponse] = await Promise.all([
                    client.get(`/slides/download/${combinedFilename}`, { responseType: 'text' }),
                    client.get(`/slides/load_highlights/${encodeURIComponent(combinedFilename)}`).catch(() => ({ data: { highlights: [] } })),
                ]);

                log.debug('sub1-highlighter', 'Raw file data received', {
                    length: String(mdResponse?.data || '').length,
                });

                const markdown = mdResponse.data;
                if (!markdown || markdown.length === 0) {
                    throw new Error('File content is empty');
                }

                setCurrentFilename(combinedFilename);
                const parsedSections = parseSections(markdown);
                log.info('sub1-highlighter', 'Parsed markdown sections', { count: parsedSections.length });

                const savedHighlights = hlResponse?.data?.highlights || [];
                if (savedHighlights.length > 0) {
                    setHighlights(savedHighlights);
                    log.info('sub1-highlighter', 'Restored saved highlights', { count: savedHighlights.length });
                }

                if (parsedSections.length > 0) {
                    setSections(parsedSections);
                    setErrorMsg('');
                    renderContent(parsedSections[0], isRenderedView);
                } else {
                    setErrorMsg('Could not parse any sections. Please check MD format.');
                }
            } catch (error: any) {
                log.error('sub1-highlighter', 'Failed to load markdown file', { message: error?.message });
                setErrorMsg('Error loading file: ' + error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const parseSections = (markdown: string): Section[] => {
        if (!markdown) return [];
        const rawChunks = String(markdown).split('===SECTION_BREAK===');
        return rawChunks.map(chunk => {
            const lines = chunk.trim().split(/\r?\n/);
            if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return null;
            const title = lines[0].replace(/^#+\s*/, '').trim();
            const content = lines.slice(1).join('\n').trim();
            return { title, content };
        }).filter((item): item is Section => item !== null);
    };

    const renderContent = (section: Section | undefined, rendered: boolean) => {
        if (!section) return;
        if (rendered) {
            const rawHtml = marked.parse(section.content || '') as string;
            const cleanHtml = DOMPurify.sanitize(rawHtml);
            setHtmlContent(cleanHtml);
        } else {
            setHtmlContent(section.content);
        }
    };

    const showSection = (index: number) => {
        setCurrentSectionIndex(index);
        renderContent(sections[index], isRenderedView);
    };

    const toggleView = () => {
        const newView = !isRenderedView;
        setIsRenderedView(newView);
        renderContent(sections[currentSectionIndex], newView);
    };

    const handleHighlightCreated = useCallback(({ id, text, sectionTitle }: { id: string; text: string; sectionTitle: string }) => {
        setHighlights(prev => {
            const isDuplicate = prev.some(h => h.text === text && h.sectionTitle === sectionTitle);
            if (isDuplicate) {
                log.warn('sub1-highlighter', 'Duplicate highlight skipped', { text: text.substring(0, 40) });
                return prev;
            }
            return [...prev, { id, text, sectionTitle }];
        });
    }, []);

    const removeHighlight = useCallback((id: string) => {
        setHighlights(prev => prev.filter(h => h.id !== id));
    }, []);

    const classifyHighlights = async () => {
        if (highlights.length === 0) {
            setStatusMsg('No highlights to classify');
            setTimeout(() => setStatusMsg(''), 2000);
            return;
        }
        setClassifying(true);
        setStatusMsg('Classifying highlights...');
        try {
            const organizedData = sections.map(sec => ({
                sectionTitle: sec.title,
                highlights: highlights.filter(h => h.sectionTitle === sec.title).map(h => ({ text: h.text, id: h.id })),
            })).filter(sec => sec.highlights.length > 0);

            const res = await client.post('/slides/classify-highlights', { highlights: organizedData });
            const classified: Array<{ id: string; category: string; confidence: number; reason: string }> = res.data.highlights || [];

            setHighlights(prev => prev.map(h => {
                const match = classified.find(c => c.id === h.id);
                return match ? { ...h, category: match.category, confidence: match.confidence, reason: match.reason } : h;
            }));

            const stats = res.data.stats || {};
            setStatusMsg(`Classified ${stats.total || 0} highlights (${stats.low_confidence_count || 0} low confidence)`);
            setTimeout(() => setStatusMsg(''), 4000);
        } catch (error: any) {
            setStatusMsg('Classification failed: ' + (error?.response?.data?.detail || error.message));
            setTimeout(() => setStatusMsg(''), 3000);
        } finally {
            setClassifying(false);
        }
    };

    const removeByCategoryOrConfidence = (category: string | null = null, maxConfidence: number | null = null) => {
        setHighlights(prev => prev.filter(h => {
            if (category && h.category === category) return false;
            if (maxConfidence != null && h.confidence != null && h.confidence < maxConfidence) return false;
            return true;
        }));
    };

    const saveHighlights = async () => {
        if (highlights.length === 0) {
            setStatusMsg('No highlights to save');
            setTimeout(() => setStatusMsg(''), 2000);
            return;
        }
        const organizedData = sections.map(sec => ({
            sectionTitle: sec.title,
            highlights: highlights.filter(h => h.sectionTitle === sec.title).map(h => ({ text: h.text, id: h.id })),
        })).filter(sec => sec.highlights.length > 0);
        try {
            await client.post('/slides/save_highlights', { filename: currentFilename, highlights: organizedData });
            setStatusMsg('Highlights saved successfully!');
            localStorage.setItem('highlightsData', JSON.stringify(organizedData));
            setTimeout(() => navigate('/slides/specify'), 1000);
        } catch (error: any) {
            setStatusMsg('Error saving highlights: ' + error.message);
            setTimeout(() => setStatusMsg(''), 2000);
        }
    };

    return {
        states: {
            loading,
            sections,
            currentSectionIndex,
            currentSectionTitle: sections[currentSectionIndex]?.title || 'Unknown Section',
            isRenderedView,
            htmlContent,
            highlights,
            statusMsg,
            markdownViewRef,
            classifying,
            categoryFilter,
        },
        handlers: {
            showSection,
            toggleView,
            saveHighlights,
            removeHighlight,
            onHighlightCreated: handleHighlightCreated,
            classifyHighlights,
            setCategoryFilter,
            removeByCategoryOrConfidence,
        },
    };
}
